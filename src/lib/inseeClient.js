import { withTimeout } from './llmClient.js'

const SIRENE_BASE = 'https://recherche-entreprises.api.gouv.fr/search'
// matching_etablissements : établissements qui ont matché la zone — utile pour l'affichage, inutile pour l'export
const SIRENE_SEARCH_INCLUDE = 'dirigeants,finances,siege,matching_etablissements'
const SIRENE_EXPORT_INCLUDE = 'dirigeants,finances,siege'
const RETRYABLE = new Set([429, 502, 503, 504])
const sleep = ms => new Promise(r => setTimeout(r, ms))

function buildQs(params) {
  return new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  )
}

/**
 * Recherche une page SIRENE avec retry sur 429/502/503/504 et backoff exponentiel.
 * Throws :
 *   { isTimeout: true, label }             — timeout 10s
 *   { isSireneError: true, status, body }  — réponse non-2xx après retries
 */
export async function searchSirene(params, retries = 2) {
  const qs = buildQs({ ...params, minimal: 'true', include: SIRENE_SEARCH_INCLUDE })
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await withTimeout(
      (signal) => fetch(`${SIRENE_BASE}?${qs}`, { signal }),
      10000,
      'SIRENE'
    )
    if (RETRYABLE.has(res.status) && attempt < retries) {
      await sleep(1000 * 2 ** attempt) // backoff exponentiel : 1s, 2s
      continue
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw Object.assign(new Error(`SIRENE ${res.status}`), { isSireneError: true, status: res.status, body })
    }
    const data = await res.json()
    return { results: data.results ?? [], total: data.total_results ?? 0 }
  }
}

/**
 * Récupère toutes les pages SIRENE pour l'export (max 20 pages × 25 = 500 résultats).
 * Chaque page a son propre timeout (10s) et son propre retry sur erreurs transitoires.
 */
export async function fetchAllSirene(params, maxPages = 20) {
  const { per_page: _pp, page: _pg, ...base } = params
  const results = []
  let page = 1
  let total = Infinity

  while (results.length < total && page <= maxPages) {
    const qs = buildQs({ ...base, minimal: 'true', include: SIRENE_EXPORT_INCLUDE, per_page: '25', page: String(page) })

    let res
    for (let attempt = 0; attempt <= 2; attempt++) {
      res = await withTimeout(
        (signal) => fetch(`${SIRENE_BASE}?${qs}`, { signal }),
        10000,
        `SIRENE-page-${page}`
      )

      if (RETRYABLE.has(res.status) && attempt < 2) {
        await sleep(1000 * 2 ** attempt)
        continue
      }
      break
    }

    if (!res.ok) break // erreur persistante — arrêter la pagination proprement
    const data = await res.json()
    total = data.total_results ?? 0
    const batch = data.results ?? []
    results.push(...batch)
    if (batch.length < 25) break
    page++
    if (page <= maxPages) await sleep(150)
  }

  return { results, total }
}
