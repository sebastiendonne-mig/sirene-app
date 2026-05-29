import { withTimeout } from './llmClient.js'

const SIRENE_BASE = 'https://recherche-entreprises.api.gouv.fr/search'
const SIRENE_INCLUDE = 'dirigeants,finances,siege'
const sleep = ms => new Promise(r => setTimeout(r, ms))

function buildQs(params) {
  return new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  )
}

/**
 * Recherche une page SIRENE avec retry sur 429 et backoff.
 * Throws :
 *   { isTimeout: true, label }             — timeout 10s
 *   { isSireneError: true, status, body }  — réponse non-2xx
 */
export async function searchSirene(params, retries = 2) {
  const qs = buildQs({ ...params, minimal: 'true', include: SIRENE_INCLUDE })
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await withTimeout(
      (signal) => fetch(`${SIRENE_BASE}?${qs}`, { signal }),
      10000,
      'SIRENE'
    )
    if (res.status === 429 && attempt < retries) {
      await sleep(1000 * (attempt + 1)) // backoff linéaire : 1s, 2s
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
 * Sans timeout global — chaque page a son propre timeout via withTimeout.
 */
export async function fetchAllSirene(params, maxPages = 20) {
  const { per_page: _pp, page: _pg, ...base } = params
  const results = []
  let page = 1
  let total = Infinity

  while (results.length < total && page <= maxPages) {
    const qs = buildQs({ ...base, minimal: 'true', include: SIRENE_INCLUDE, per_page: '25', page: String(page) })
    const res = await withTimeout(
      (signal) => fetch(`${SIRENE_BASE}?${qs}`, { signal }),
      10000,
      `SIRENE-page-${page}`
    )
    if (!res.ok) break
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
