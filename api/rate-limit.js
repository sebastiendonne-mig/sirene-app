import { createClient } from '@supabase/supabase-js'

export async function checkRateLimit(ip, endpoint, maxRequests, windowMinutes) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  // Si Supabase non configuré, on laisse passer sans bloquer
  if (!url || !key) return { allowed: true, remaining: maxRequests }

  const supabase = createClient(url, key)
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()

  const { count } = await supabase
    .from('searches')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('endpoint', endpoint)
    .gte('created_at', since)

  const used = count ?? 0
  const allowed = used < maxRequests

  if (allowed) {
    await supabase.from('searches').insert({ ip, endpoint })
  }

  return { allowed, remaining: Math.max(0, maxRequests - used - 1) }
}
