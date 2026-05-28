import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const ip = (req.headers['x-forwarded-for'] ?? 'unknown').split(',')[0].trim()

  try {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) return res.json({ remaining: 2 })

    const supabase = createClient(url, key)
    const since = new Date()
    since.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('exports_log')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since.toISOString())

    return res.json({ remaining: Math.max(0, 2 - (count ?? 0)) })
  } catch {
    return res.json({ remaining: 2 })
  }
}
