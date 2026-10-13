// Stand-in for src/lib/supabase.ts in the unit tests: the pure helpers under test never call it. A test that
// needs answers from the database (the My QR prefetch, #303) sets globalThis.__testSupabase to a fake client.

export const supabase = new Proxy({}, {
  get(_target, key) {
    if (globalThis.__testSupabase) return globalThis.__testSupabase[key];
    throw new Error('the unit tests do not reach the database');
  },
});
