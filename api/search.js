const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function withTimeout(promise, ms, label) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return promise(controller.signal).finally(() => clearTimeout(timer)).catch(err => {
    if (err.name === 'AbortError') throw Object.assign(new Error(`Timeout ${label} (${ms}ms)`), { isTimeout: true, label })
    throw err
  })
}

async function fetchSirene(qs, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await withTimeout(
      (signal) => fetch(`https://recherche-entreprises.api.gouv.fr/search?${qs}`, { signal }),
      4000,
      'SIRENE'
    )
    if (res.status === 429 && attempt < retries) {
      await sleep(1000)
      continue
    }
    return res
  }
}

async function callSirene(params, res) {
  const qs = new URLSearchParams(
    Object.entries({ ...params, minimal: 'true', include: 'dirigeants,finances,siege' })
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
  )
  console.log('[search] Params SIRENE:', JSON.stringify(params))
  const sireneRes = await fetchSirene(qs)
  if (!sireneRes.ok) {
    const errBody = await sireneRes.json().catch(() => ({}))
    console.error('[search] Erreur SIRENE', sireneRes.status, JSON.stringify(errBody))
    if (sireneRes.status === 429) return res.status(429).json({ error: 'rate_limit' })
    if (sireneRes.status === 400) return res.status(400).json({ error: 'Paramètres invalides', detail: errBody, params })
    return res.status(502).json({ error: 'Erreur API SIRENE', status: sireneRes.status })
  }
  const data = await sireneRes.json()
  return res.json({
    params,
    results: data.results ?? [],
    total: data.total_results ?? 0,
  })
}

// Résout la zone geo (ville / dept / CP / région) en paramètre SIRENE
async function resolveGeo(geo, apiKey) {
  // Tableau de sélections mixtes (communes + depts + régions)
  if (Array.isArray(geo)) {
    const depts = geo.filter(g => g.type === 'departement')
    const regions = geo.filter(g => g.type === 'region')
    const communes = geo.filter(g => g.type === 'commune')
    if (depts.length > 0) return { departement: depts[0].code }
    if (regions.length > 0) return { region: regions[0].code }
    if (communes.length > 0) return { code_postal: communes.map(c => c.code_postal).join(',') }
    return {}
  }
  // Objet déjà résolu (depuis l'autocomplete front)
  if (geo && typeof geo === 'object') return geo

  if (typeof geo === 'string') geo = geo.trim()

  // Détection directe : code département 2 chiffres
  if (/^\d{2}$/.test(geo)) {
    return { departement: geo }
  }
  // Code postal 5 chiffres
  if (/^\d{5}$/.test(geo)) {
    return { code_postal: geo }
  }

  // Sinon on demande à Claude de résoudre
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: `Convertis une zone géographique française en paramètre API SIRENE.
Réponds UNIQUEMENT avec un JSON valide, sans markdown.
Paramètres possibles (un seul) :
- { "departement": "83" }   → pour un département (code 2 chiffres INSEE)
- { "code_postal": "83000" } → pour un code postal
- { "region": "93" }         → pour une région (code INSEE 2 chiffres : 84=AuRA, 93=PACA, 11=IDF, 75=NA, 76=OCC, 32=HDF, 28=Normandie, 53=Bretagne, 52=PDL, 44=GE, 27=BFC, 24=NA, 94=Corse)
- { "q": "Lyon" }            → pour une ville (q = nom ville)`,
      messages: [{ role: 'user', content: geo }],
    }),
  })

  if (!claudeRes.ok) return { q: geo } // fallback

  const data = await claudeRes.json()
  try {
    const raw = data.content[0].text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    return JSON.parse(raw)
  } catch {
    return { q: geo } // fallback : on passe la zone en mots-clés libres
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const t0 = Date.now()

  try {
    const { naf_codes, geo, params: providedParams, status } = req.body ?? {}

    // "Voir plus" : params déjà résolus
    if (providedParams && typeof providedParams === 'object') {
      return await callSirene(providedParams, res)
    }

    // Validation
    if (!naf_codes?.length) return res.status(400).json({ error: 'Paramètre naf_codes manquant' })
    if (!geo || (typeof geo === 'string' && !geo.trim()) || (Array.isArray(geo) && !geo.length)) return res.status(400).json({ error: 'Paramètre geo manquant' })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY absente' })

    // Résolution geo
    const geoParams = await resolveGeo(geo, apiKey)

    // Construction des params SIRENE
    const etat = Array.isArray(status) && status.length === 1 ? status[0] : undefined
    const params = {
      ...geoParams,
      activite_principale: naf_codes.join(','),
      ...(etat ? { etat_administratif: etat } : {}),
      per_page: 10,
      page: 1,
    }

    const result = await callSirene(params, res)
    console.log(`[search] OK en ${Date.now() - t0}ms`)
    return result

  } catch (err) {
    const elapsed = Date.now() - t0
    if (err.isTimeout) {
      console.error(`[search] Timeout ${err.label} après ${elapsed}ms`)
      return res.status(504).json({ error: 'timeout', service: err.label })
    }
    console.error('[search] Exception', err)
    return res.status(500).json({ error: 'Erreur interne', message: err.message })
  }
}
