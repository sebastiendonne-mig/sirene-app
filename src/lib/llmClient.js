// Client Haiku isolé — sera mutualisé avec inseeClient via httpClient.js
// withTimeout est exporté pour usage dans inseeClient.js

const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'

export function withTimeout(promise, ms, label) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return promise(controller.signal).finally(() => clearTimeout(timer)).catch(err => {
    if (err.name === 'AbortError') throw Object.assign(new Error(`Timeout ${label} (${ms}ms)`), { isTimeout: true, label })
    throw err
  })
}

/**
 * Appelle Claude Haiku et retourne le texte brut de la réponse.
 * Throws :
 *   { isTimeout: true, label }  — si la requête dépasse ms (défaut 10s)
 *   { isApiError: true, status } — si l'API renvoie un statut non-2xx
 */
export async function callHaiku({ apiKey, system, userContent, maxTokens = 600 }) {
  const res = await withTimeout(
    (signal) => fetch(CLAUDE_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal,
    }),
    10000,
    'Claude'
  )
  if (!res.ok) {
    throw Object.assign(new Error(`Claude API ${res.status}`), { isApiError: true, status: res.status })
  }
  const data = await res.json()
  return data.content[0].text
}
