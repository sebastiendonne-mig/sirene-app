import { checkRateLimit } from './rate-limit.js'
import { geoSystemPrompt } from '../prompts/sirenePrompts.js'
import { callHaiku } from '../src/lib/llmClient.js'
import { searchSirene } from '../src/lib/inseeClient.js'

// Résout la zone geo (ville / dept / CP / région) en paramètre SIRENE
async function resolveGeo(geo, apiKey) {
  if (Array.isArray(geo)) {
    const depts = geo.filter(g => g.type === 'departement')
    const regions = geo.filter(g => g.type === 'region')
    const communes = geo.filter(g => g.type === 'commune')
    if (depts.length > 0) return { departement: depts[0].code }
    if (regions.length > 0) return { region: regions[0].code }
    if (communes.length > 0) return { code_postal: communes.map(c => c.code_postal).join(',') }
    return {}
  }
  if (geo && typeof geo === 'object') return geo

  if (typeof geo === 'string') geo = geo.trim()
  if (/^\d{2}$/.test(geo)) return { departement: geo }
  if (/^\d{5}$/.test(geo)) return { code_postal: geo }

  // Claude fallback — timeout 10s, dégradation silencieuse sur tout échec
  try {
    const text = await callHaiku({ apiKey, system: geoSystemPrompt, userContent: geo, maxTokens: 100 })
    const raw = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    return JSON.parse(raw)
  } catch {
    return { q: geo }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const t0 = Date.now()
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket?.remoteAddress ?? 'unknown'
  let sireneParams = null

  try {
    const { naf_codes, geo, params: providedParams, status } = req.body ?? {}

    // "Voir plus" : params déjà résolus — rate limit appliqué quand même
    if (providedParams && typeof providedParams === 'object') {
      const { allowed } = await checkRateLimit(ip, 'api/search', 50, 60)
      if (!allowed) return res.status(429).json({ error: 'rate_limit', message: 'Limite atteinte, réessayez dans une heure' })
      const { results, total } = await searchSirene(providedParams)
      return res.json({ params: providedParams, results, total })
    }

    // Rate limiting
    const { allowed } = await checkRateLimit(ip, 'api/search', 50, 60)
    if (!allowed) return res.status(429).json({ error: 'rate_limit', message: 'Limite atteinte, réessayez dans une heure' })

    // Validation
    if (!naf_codes?.length) return res.status(400).json({ error: 'Paramètre naf_codes manquant' })
    if (!geo || (typeof geo === 'string' && !geo.trim()) || (Array.isArray(geo) && !geo.length)) return res.status(400).json({ error: 'Paramètre geo manquant' })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY absente' })

    const geoParams = await resolveGeo(geo, apiKey)
    const etat = Array.isArray(status) && status.length === 1 ? status[0] : undefined
    sireneParams = {
      ...geoParams,
      activite_principale: naf_codes.join(','),
      ...(etat ? { etat_administratif: etat } : {}),
      per_page: 10,
      page: 1,
    }

    console.log('[search] Params SIRENE:', JSON.stringify(sireneParams))
    const { results, total } = await searchSirene(sireneParams)
    console.log(`[search] OK en ${Date.now() - t0}ms`)
    return res.json({ params: sireneParams, results, total })

  } catch (err) {
    const elapsed = Date.now() - t0
    if (err.isTimeout) {
      console.error(`[search] Timeout ${err.label} après ${elapsed}ms`)
      return res.status(504).json({ error: 'timeout', service: err.label })
    }
    if (err.isSireneError) {
      console.error('[search] Erreur SIRENE', err.status, JSON.stringify(err.body))
      if (err.status === 429) return res.status(429).json({ error: 'rate_limit' })
      if (err.status === 400) return res.status(400).json({ error: 'Paramètres invalides', detail: err.body, params: sireneParams })
      return res.status(502).json({ error: 'Erreur API SIRENE', status: err.status })
    }
    console.error('[search] Exception', err)
    return res.status(500).json({ error: 'Erreur interne', message: err.message })
  }
}
