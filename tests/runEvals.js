/**
 * Evals de régression — node tests/runEvals.js
 * Aucun appel réseau réel : Claude et SIRENE sont mockés via global.fetch.
 * Supabase non configuré → rate limiting fail-open (comportement intentionnel).
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Clé fictive pour que les handlers ne court-circuitent pas sur ANTHROPIC_API_KEY absent
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-fake'

// ─── Mini runner ─────────────────────────────────────────────────────────────
let passed = 0, failed = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${e.message}`)
    failed++
  }
}

// ─── Mock fetch ──────────────────────────────────────────────────────────────
function mockFetch(urlHandlers) {
  global.fetch = async (url, opts) => {
    for (const [pattern, responder] of Object.entries(urlHandlers)) {
      if (url.includes(pattern)) return responder(url, opts)
    }
    throw new Error(`fetch non mockée : ${url}`)
  }
}

function makeClaudeResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{ text: JSON.stringify(body) }] }),
  }
}

function makeSireneResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  }
}

// ─── Mock req/res ────────────────────────────────────────────────────────────
function makeReq(body) {
  return {
    method: 'POST',
    body,
    headers: { 'x-forwarded-for': '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
  }
}

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    setHeader() { return this },
    status(code) { this._status = code; return this },
    json(body) { this._body = body; return this },
    end() { return this },
  }
  return res
}

// ─── Fixtures ────────────────────────────────────────────────────────────────
const fixtures = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'sirene_evals.json'), 'utf8')
)

// ─── Imports (après setup env) ───────────────────────────────────────────────
const { nafLlmResponseSchema, geoLlmResponseSchema } = await import('../src/types/sireneSchemas.js')
const nafHandler = (await import('../api/naf.js')).default
const searchHandler = (await import('../api/search.js')).default

// ─── 1. Schémas NAF ──────────────────────────────────────────────────────────
console.log('\nSchémas NAF')
for (const c of fixtures.naf_schema) {
  await test(`${c.id} — ${c.description}`, () => {
    const result = nafLlmResponseSchema.safeParse(c.input)
    if (c.expect === 'valid') {
      assert.ok(result.success, `attendu valide — ${JSON.stringify(result.error?.issues)}`)
    } else {
      assert.ok(!result.success, 'attendu invalide — Zod a accepté la valeur')
    }
  })
}

// ─── 2. Schémas Géo ──────────────────────────────────────────────────────────
console.log('\nSchémas Géo')
for (const c of fixtures.geo_schema) {
  await test(`${c.id} — ${c.description}`, () => {
    const result = geoLlmResponseSchema.safeParse(c.input)
    if (c.expect === 'valid') {
      assert.ok(result.success, `attendu valide — ${JSON.stringify(result.error?.issues)}`)
    } else {
      assert.ok(!result.success, 'attendu invalide — Zod a accepté la valeur')
    }
  })
}

// ─── 3. Handler /api/naf ─────────────────────────────────────────────────────
console.log('\nHandler /api/naf')
for (const c of fixtures.naf_handler) {
  await test(`${c.id} — ${c.description}`, async () => {
    if (c.claude_mock) {
      mockFetch({ 'api.anthropic.com': () => makeClaudeResponse(c.claude_mock) })
    }
    const req = makeReq(c.req_body)
    const res = makeRes()
    await nafHandler(req, res)
    assert.strictEqual(
      res._status, c.expect_status,
      `status ${res._status} ≠ ${c.expect_status} | body: ${JSON.stringify(res._body)}`
    )
    if (c.expect_codes) {
      assert.deepStrictEqual(
        res._body.codes.map(x => x.code),
        c.expect_codes
      )
    }
  })
}

// ─── 4. Handler /api/search ──────────────────────────────────────────────────
console.log('\nHandler /api/search')
for (const c of fixtures.search_handler) {
  await test(`${c.id} — ${c.description}`, async () => {
    const fetchHandlers = {}
    if (c.claude_mock) {
      fetchHandlers['api.anthropic.com'] = () => makeClaudeResponse(c.claude_mock)
    }
    if (c.sirene_mock) {
      fetchHandlers['recherche-entreprises'] = () => makeSireneResponse(c.sirene_mock)
    }
    if (Object.keys(fetchHandlers).length) mockFetch(fetchHandlers)

    const req = makeReq(c.req_body)
    const res = makeRes()
    await searchHandler(req, res)
    assert.strictEqual(
      res._status, c.expect_status,
      `status ${res._status} ≠ ${c.expect_status} | body: ${JSON.stringify(res._body)}`
    )
    if (c.expect_params_key) {
      assert.strictEqual(
        res._body?.params?.[c.expect_params_key],
        c.expect_params_value,
        `params.${c.expect_params_key} = ${res._body?.params?.[c.expect_params_key]} ≠ ${c.expect_params_value}`
      )
    }
  })
}

// ─── 5. Retry 502/503/504 ────────────────────────────────────────────────────
console.log('\nRetry 502/503/504')

// Mock séquentiel : renvoie chaque réponse à tour de rôle, puis boucle sur la dernière
function makeSequential(responses) {
  let i = 0
  return () => responses[Math.min(i++, responses.length - 1)]
}

await test('callHaiku — retry sur 503 puis succès', async () => {
  let calls = 0
  global.fetch = async () => {
    calls++
    if (calls === 1) return { ok: false, status: 503, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => ({ content: [{ text: '{"codes":[{"code":"43.22A","label":"Test"}]}' }] }) }
  }
  const { callHaiku } = await import('../src/lib/llmClient.js?retry=1')
  const text = await callHaiku({ apiKey: 'sk-test', system: 'sys', userContent: 'usr' })
  assert.ok(text.includes('43.22A'), `texte inattendu : ${text}`)
  assert.strictEqual(calls, 2, `attendu 2 appels (1 retry), obtenu ${calls}`)
})

await test('callHaiku — 3 échecs consécutifs → isApiError', async () => {
  global.fetch = async () => ({ ok: false, status: 502, json: async () => ({}) })
  try {
    const { callHaiku } = await import('../src/lib/llmClient.js?retry=2')
    await callHaiku({ apiKey: 'sk-test', system: 'sys', userContent: 'usr' })
    assert.fail('aurait dû lever une erreur')
  } catch (err) {
    assert.ok(err.isApiError, `attendu isApiError, obtenu : ${err.message}`)
    assert.strictEqual(err.status, 502)
  }
})

await test('searchSirene — retry sur 502 puis succès', async () => {
  let calls = 0
  global.fetch = async () => {
    calls++
    if (calls === 1) return { ok: false, status: 502, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => ({ results: [{ siren: '123456789' }], total_results: 1 }) }
  }
  const { searchSirene } = await import('../src/lib/inseeClient.js?retry=1')
  const { results, total } = await searchSirene({ activite_principale: '43.22A' })
  assert.strictEqual(total, 1)
  assert.strictEqual(calls, 2, `attendu 2 appels (1 retry), obtenu ${calls}`)
})

await test('searchSirene — 3 échecs 503 → isSireneError', async () => {
  global.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) })
  try {
    const { searchSirene } = await import('../src/lib/inseeClient.js?retry=2')
    await searchSirene({ activite_principale: '43.22A' })
    assert.fail('aurait dû lever une erreur')
  } catch (err) {
    assert.ok(err.isSireneError, `attendu isSireneError, obtenu : ${err.message}`)
    assert.strictEqual(err.status, 503)
  }
})

// ─── Rapport ─────────────────────────────────────────────────────────────────
const total = passed + failed
console.log(`\n${passed}/${total} tests passés${failed > 0 ? ` — ${failed} échec(s)` : ''}`)
if (failed > 0) process.exit(1)
