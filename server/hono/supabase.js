import { createClient } from '@supabase/supabase-js';

const _cache = new Map();

export function getSupabase(env) {
  if (_cache.has(env.SUPABASE_URL)) return _cache.get(env.SUPABASE_URL);
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  _cache.set(env.SUPABASE_URL, client);
  return client;
}
