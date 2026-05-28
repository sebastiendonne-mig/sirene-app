import { createClient } from '@supabase/supabase-js'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const LIMIT = 2

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function getUsedToday(supabase, ip) {
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('exports_log')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', since.toISOString())
  return count ?? 0
}

async function fetchAllPages(params) {
  // Retire etat_administratif pour inclure actifs + cessés
  const { etat_administratif: _ea, per_page: _pp, page: _pg, ...base } = params
  const results = []
  let page = 1
  let total = Infinity

  while (results.length < total && page <= 20) {
    const qs = new URLSearchParams(
      Object.entries({ ...base, minimal: 'true', include: 'dirigeants,finances,siege', per_page: '25', page: String(page) })
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
    )
    const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?${qs}`)
    if (!res.ok) break
    const data = await res.json()
    total = data.total_results ?? 0
    const batch = data.results ?? []
    results.push(...batch)
    if (batch.length < 25) break
    page++
    if (page <= 20) await sleep(150)
  }

  return { results, total }
}

function mapRow(e) {
  const siege = e.siege ?? {}
  const dirigeant = (e.dirigeants ?? [])[0] ?? {}
  const finances = e.finances ?? {}
  const annees = Object.keys(finances).sort().reverse()
  const fin = annees.length ? finances[annees[0]] : {}
  return {
    siren: e.siren ?? '',
    nom_complet: e.nom_complet ?? '',
    nom_usuel: e.nom_usuel ?? '',
    sigle: e.sigle ?? '',
    date_creation: e.date_creation ?? '',
    date_fermeture: e.date_fermeture ?? '',
    etat_administratif: e.etat_administratif ?? '',
    activite_principale: e.activite_principale ?? '',
    libelle_activite: e.libelle_activite_principale ?? '',
    nature_juridique: e.nature_juridique ?? '',
    libelle_nature_juridique: e.libelle_nature_juridique ?? '',
    categorie_entreprise: e.categorie_entreprise ?? '',
    tranche_effectif_salarie: e.tranche_effectif_salarie ?? '',
    est_ess: e.est_ess ? 'oui' : 'non',
    est_qualiopi: e.est_qualiopi ? 'oui' : 'non',
    est_rge: e.est_rge ? 'oui' : 'non',
    est_entrepreneur_individuel: e.est_entrepreneur_individuel ? 'oui' : 'non',
    siege_adresse: siege.adresse ?? '',
    siege_code_postal: siege.code_postal ?? '',
    siege_ville: siege.libelle_commune ?? '',
    siege_latitude: siege.latitude ?? '',
    siege_longitude: siege.longitude ?? '',
    dirigeant_nom: dirigeant.nom ?? '',
    dirigeant_prenom: dirigeant.prenoms ?? '',
    dirigeant_qualite: dirigeant.qualite ?? '',
    ca: fin.ca ?? '',
    resultat_net: fin.resultat_net ?? '',
    annee_finances: annees[0] ?? '',
    nombre_etablissements: e.nombre_etablissements ?? '',
    nombre_etablissements_ouverts: e.nombre_etablissements_ouverts ?? '',
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const { params, format } = req.body ?? {}
  if (!params || !format) return res.status(400).json({ error: 'Paramètres manquants' })

  const ip = (req.headers['x-forwarded-for'] ?? 'unknown').split(',')[0].trim()

  const supabase = getSupabase()
  if (!supabase) return res.status(500).json({ error: 'Configuration Supabase manquante' })

  try {
    const used = await getUsedToday(supabase, ip)
    if (used >= LIMIT) return res.json({ error: 'limit_reached', remaining: 0 })

    const { results } = await fetchAllPages(params)
    const data = results.map(mapRow)

    await supabase.from('exports_log').insert({ ip, format, results_count: data.length })

    return res.json({ data, total: data.length, remaining: LIMIT - used - 1 })
  } catch (err) {
    console.error('[export] Erreur:', err)
    return res.status(500).json({ error: 'Erreur interne', message: err.message })
  }
}
