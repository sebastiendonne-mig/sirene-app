export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const { query, params, results_count } = req.body ?? {}

  // VITE_SUPABASE_URL se termine par /rest/v1/ — on ajoute directement le nom de table
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/?$/, '/')
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Variables Supabase manquantes' })
  }

  const logRes = await fetch(`${supabaseUrl}searches`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      query: query ?? '',
      params: params ?? {},
      results_count: results_count ?? 0,
      created_at: new Date().toISOString(),
    }),
  })

  if (!logRes.ok) {
    const detail = await logRes.json().catch(() => logRes.text())
    console.error('[log] Erreur Supabase', logRes.status, detail)
    return res.status(500).json({ error: 'Erreur insertion Supabase', status: logRes.status, detail })
  }

  return res.status(201).json({ ok: true })
}
