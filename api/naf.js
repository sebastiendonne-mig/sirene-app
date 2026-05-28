export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const { activity } = req.body ?? {}
  if (!activity?.trim()) return res.status(400).json({ error: 'Paramètre activity manquant' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY absente' })

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: `Tu es un expert de la nomenclature NAF/APE française.
Pour une activité ou un secteur donné, retourne les codes NAF les plus pertinents.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans commentaire.
Format : { "codes": [ { "code": "62.01Z", "label": "Programmation informatique" }, ... ] }
Maximum 8 codes. Ordonne du plus pertinent au moins pertinent.
Si l'activité correspond à un sigle ambigu (ex: ESN peut être ESN informatique ou SIAE), inclus les codes des deux interprétations principales.
Inclus toujours des codes distincts couvrant les sous-activités proches du secteur.`,
        messages: [{ role: 'user', content: activity }],
      }),
    })

    if (!claudeRes.ok) {
      return res.status(502).json({ error: 'Erreur Claude API', status: claudeRes.status })
    }

    const data = await claudeRes.json()
    const raw = data.content[0].text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(raw)

    return res.json({ codes: parsed.codes ?? [] })
  } catch (err) {
    console.error('[naf] Erreur:', err.message)
    return res.status(500).json({ error: 'Erreur interne', message: err.message })
  }
}
