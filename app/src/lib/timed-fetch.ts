// A time limit for the app's calls to Supabase (D6-02, FS3-04; docs/DECISIONS.md #237). Without it a
// connection that stalls (weak signal, a captive Wi-Fi page) keeps a call open for minutes, and at start the
// splash screen stays up the whole time. The Supabase client gets its fetch through withTimeout
// (src/lib/supabase.ts). Reads (GET) have a shorter limit than writes and the database functions (audit R5-01,
// #304): a read changes nothing, so it can give up sooner and the screen offers Try again; a write that gives up
// may still have been saved, so it waits longer.

/** How long a write or a database function (POST, PATCH, DELETE) may wait for the server's answer, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** How long a read (GET, HEAD) may wait for the server's answer, in milliseconds (#304). */
export const READ_TIMEOUT_MS = 10_000;

/**
 * The message of the error a timed-out call fails with. It contains "Network request failed", the
 * wording src/data/errors.ts isNetworkError reads, so screens show the usual "Could not reach the server"
 * and the auth client treats it as a network failure it may retry.
 */
export const TIMEOUT_MESSAGE = 'Network request failed: no answer in time';

/**
 * Uploads to Storage send the whole file before the server answers, which on a slow phone connection takes
 * longer than the limit; they keep no time limit.
 */
function isUpload(address: string, method: string): boolean {
  return (method === 'POST' || method === 'PUT') && /\/storage\/v1\/(object|upload)\//.test(address);
}

/**
 * The time limit of one call in milliseconds: READ_TIMEOUT_MS for a read, REQUEST_TIMEOUT_MS for anything
 * else, null for a Storage upload (no limit, see isUpload).
 * @param address the call's web address.
 * @param method the HTTP method in capitals.
 */
export function timeLimitFor(address: string, method: string): number | null {
  if (isUpload(address, method)) return null;
  return method === 'GET' || method === 'HEAD' ? READ_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
}

/**
 * fetch with a time limit on the server's answer: a call with no answer (headers) within the limit is
 * cancelled and fails with a TypeError(TIMEOUT_MESSAGE), like a call with no internet. The limit ends when
 * the answer starts, so a long download of a file is not cut off. A signal the caller passes still cancels
 * the call as before. Storage uploads are left without a limit (see isUpload).
 * @param base the fetch to wrap.
 * @param ms one limit in milliseconds for every call (the tests); without it each call gets timeLimitFor's.
 */
export function withTimeout(base: typeof fetch, ms?: number): typeof fetch {
  return async (input, init) => {
    const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    const limit = isUpload(address, method) ? null : (ms ?? timeLimitFor(address, method));
    if (limit === null) return base(input, init);

    // A controller and a timer, not AbortSignal.timeout(ms): that timer cannot be stopped when the answer
    // arrives, and the phones' JavaScript engine (Hermes) may not have it. The timer also rejects by itself,
    // so a fetch that ignores the signal cannot keep the call open either.
    const controller = new AbortController();
    const callerSignal = init?.signal;
    const passOnAbort = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) passOnAbort();
    // Left in place after the answer arrives, so the caller can still cancel reading a long body.
    else callerSignal?.addEventListener('abort', passOnAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const noAnswer = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new TypeError(TIMEOUT_MESSAGE));
        controller.abort();
      }, limit);
    });
    try {
      return await Promise.race([base(input, { ...init, signal: controller.signal }), noAnswer]);
    } finally {
      clearTimeout(timer);
    }
  };
}
