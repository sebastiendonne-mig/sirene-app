import { createRequire } from 'module'
import { checkRateLimit } from './rate-limit.js'

const require = createRequire(import.meta.url)
const nafCodes = require('./naf-codes.json')

function withTimeout(promise, ms, label) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return promise(controller.signal).finally(() => clearTimeout(timer)).catch(err => {
    if (err.name === 'AbortError') throw Object.assign(new Error(`Timeout ${label} (${ms}ms)`), { isTimeout: true, label })
    throw err
  })
}

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
    const claudeRes = await withTimeout(
      (signal) => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system: `Tu es un expert de la nomenclature NAF rév.2 officielle française (INSEE).
Retourne UNIQUEMENT des codes NAF qui existent réellement dans cette nomenclature.
Ne jamais inventer un code — si tu n'es pas certain qu'il existe, ne pas l'inclure.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown.
Format : { "codes": [ { "code": "62.01Z", "label": "Programmation informatique" }, ... ] }
Maximum 6 codes, du plus pertinent au moins pertinent.
Voici tous les codes NAF valides :
${codesList}
Utilise UNIQUEMENT des codes de cette liste exacte.`,
          messages: [{ role: 'user', content: activity }],
        }),
        signal,
      }),
      10000,
      'Claude-naf'
    )

    if (!claudeRes.ok) {
      return res.status(502).json({ error: 'Erreur Claude API', status: claudeRes.status })
    }

    const data = await claudeRes.json()
    const raw = data.content[0].text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(raw)

    return res.json({ codes: parsed.codes ?? [] })
  } catch (err) {
    console.error('[naf] Erreur:', err.message)
    if (err.isTimeout) return res.status(504).json({ error: 'timeout', service: err.label })
    return res.status(500).json({ error: 'Erreur interne', message: err.message })
  }
}
