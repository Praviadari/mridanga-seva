// Parents' contacts, consents and call notes are read through database functions that write each
// read to the access log (get_guardians, get_consents, get_call_notes; migration 0034, docs/DATABASE.md
// "Access log"). A database without 0034 has no such function (PostgREST answers PGRST202): then the
// old direct table read is used, so an update with this code may reach phones before the migration.
// Since 0061 (docs/DECISIONS.md #583) the functions answer mfa_required while the Guru asks for sign-in codes and
// this session did not give one: the read then counts as empty and says so (mfaRequired), so the screen still
// shows everything else and tells the person to set up their code.

/** What both kinds of read answer with. */
type Read = { data: unknown; error: { code?: string; message: string } | null; mfaRequired?: boolean };

/** Runs the logging function; falls back to `tableRead` only when the function does not exist yet. */
export async function readLogged(rpc: PromiseLike<Read>, tableRead: () => PromiseLike<Read>): Promise<Read> {
  const result = await rpc;
  if (result.error?.code === 'PGRST202') return tableRead();
  if (result.error?.message === 'mfa_required') return { data: [], error: null, mfaRequired: true };
  return result;
}
