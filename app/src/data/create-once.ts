// A create that is saved once, however often Save is tapped again after a lost answer (audit phase 1
// P1-02 / F5-01 / F4-01, docs/DECISIONS.md #322). On a weak network the server can store the row while
// its answer is lost; the screen then says "try again", and before this the second Save made a second
// fund entry, call note, event or poll (which told everyone twice). Now each open form holds one request
// id (a uuid) and sends it with the row; the tables have a unique request_id (migration 0062), so a
// repeat is refused by the database and the app looks the first row up instead. register_student has
// done the same since #126 (p_request_id).

import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';

import { isNetworkError } from './errors';

/** A fresh request id: one per open form, kept across retries, replaced after a success. */
export function newRequestId(): string {
  return Crypto.randomUUID().toLowerCase();
}

/** The tables whose creates carry a request id (0062). */
export type OnceTable =
  | 'events'
  | 'polls'
  | 'assessments'
  | 'materials'
  | 'syllabus_items'
  | 'ig_themes'
  | 'announcement_replies';

type DbError = { message: string; code?: string };

/** True when the database refused the row because this request id was saved already (0062's unique index). */
export function isRepeatedRequest(error: DbError): boolean {
  return error.code === '23505' && error.message.includes('request_id');
}

/** True when the first try may have been saved: the same request again, or no answer. */
export function maySaveTwice(error: DbError): boolean {
  return isRepeatedRequest(error) || isNetworkError(error.message);
}

/** The id of the row saved with this request id, null when there is none, undefined when it could not be read. */
export async function savedWith(table: OnceTable, requestId: string): Promise<number | null | undefined> {
  const { data, error } = await supabase.from(table).select('id').eq('request_id', requestId).maybeSingle<{ id: number }>();
  if (error) return undefined;
  return data?.id ?? null;
}

/**
 * Calls a request-id twin of a database function (0062: record_fund_entry, log_call, log_practice with
 * p_request_id). The twin itself returns the row saved earlier; only when two Saves of the same form
 * were in flight at once does the second meet the unique index, and is then asked once more.
 */
export async function rpcOnce<T>(fn: string, args: Record<string, unknown>): Promise<{ data: T | null; error: DbError | null }> {
  let result = await supabase.rpc(fn, args);
  if (result.error && isRepeatedRequest(result.error)) result = await supabase.rpc(fn, args);
  return { data: (result.data as T | null) ?? null, error: result.error };
}

/** Uploads kept per request and picked file, so a Save repeated after a lost answer sends the same file, not a copy. */
const uploadsByRequest = new Map<string, unknown>();

/**
 * The upload made for this request and file earlier in this app run, or a new one by `upload` (kept
 * when it succeeds). `fileKey` names the picked file(s), so a different pick uploads again.
 */
export async function uploadOnce<T>(requestId: string, fileKey: string, upload: () => Promise<T | null>): Promise<T | null> {
  const key = `${requestId}:${fileKey}`;
  if (uploadsByRequest.has(key)) return uploadsByRequest.get(key) as T;
  const done = await upload();
  if (done !== null) uploadsByRequest.set(key, done);
  return done;
}

/** Forgets the uploads of a request: after its row was saved, or after a refusal removed the files. */
export function forgetUploads(requestId: string): void {
  for (const key of [...uploadsByRequest.keys()]) if (key.startsWith(`${requestId}:`)) uploadsByRequest.delete(key);
}

/**
 * Inserts `row` with `requestId` and returns the new id. When the database says this request was saved
 * already, or no answer came, the row saved earlier is looked up: `repeated` is then true (the caller
 * must not delete files that row lists, and may delete files uploaded again for the repeat). Otherwise
 * the database's error is returned, for the caller's own message.
 */
export async function insertOnce(
  table: OnceTable,
  row: Record<string, unknown>,
  requestId: string,
): Promise<{ id: number; repeated: boolean } | { error: DbError }> {
  const { data, error } = await supabase
    .from(table)
    .insert({ ...row, request_id: requestId })
    .select('id')
    .single<{ id: number }>();
  if (!error) return { id: data.id, repeated: false };
  if (maySaveTwice(error)) {
    const saved = await savedWith(table, requestId);
    if (saved) return { id: saved, repeated: true };
  }
  return { error };
}
