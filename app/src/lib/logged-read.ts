// Parents' contacts, consents and call notes are read through database functions that write each
// read to the access log (get_guardians, get_consents, get_call_notes; migration 0034, docs/DATABASE.md
// "Access log"). A database without 0034 has no such function (PostgREST answers PGRST202): then the
// old direct table read is used, so an update with this code may reach phones before the migration.

/** What both kinds of read answer with. */
type Read = { data: unknown; error: { code?: string; message: string } | null };

/** Runs the logging function; falls back to `tableRead` only when the function does not exist yet. */
export async function readLogged(rpc: PromiseLike<Read>, tableRead: () => PromiseLike<Read>): Promise<Read> {
  const result = await rpc;
  if (result.error?.code === 'PGRST202') return tableRead();
  return result;
}
