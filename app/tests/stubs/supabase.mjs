// Stand-in for src/lib/supabase.ts in the unit tests: the pure helpers under test never call it.

export const supabase = new Proxy({}, {
  get() {
    throw new Error('the unit tests do not reach the database');
  },
});
