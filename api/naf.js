import { createRequire } from 'module'
import { checkRateLimit } from './rate-limit.js'
import { callHaiku } from '../src/lib/llmClient.js'
import { nafSystemPrompt } from '../prompts/sirenePrompts.js'

const require = createRequire(import.meta.url)
const nafCodes = require('./naf-codes.json')
const codesList = nafCodes.map(c => c.code + ': ' + c.label).join('\n')

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const { activity } = req.body ?? {}
  if (!activity?.trim()) return res.status(400).json({ error: 'Paramètre activity manquant' })

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket?.remoteAddress ?? 'unknown'
  const { allowed } = await checkRateLimit(ip, 'api/naf', 30, 60)
  if (!allowed) return res.status(429).json({ error: 'rate_limit', message: 'Limite atteinte, réessayez dans une heure' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY absente' })

  try {
    const text = await callHaiku({ apiKey, system: nafSystemPrompt(codesList), userContent: activity, maxTokens: 600 })
    const raw = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(raw)
    return res.json({ codes: parsed.codes ?? [] })
  } catch (err) {
    console.error('[naf] Erreur:', err.message)
    if (err.isTimeout) return res.status(504).json({ error: 'timeout', service: err.label })
    if (err.isApiError) return res.status(502).json({ error: 'Erreur Claude API', status: err.status })
    return res.status(500).json({ error: 'Erreur interne', message: err.message })
  }
}
