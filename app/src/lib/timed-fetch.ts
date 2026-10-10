// A time limit for the app's calls to Supabase (D6-02, FS3-04; docs/DECISIONS.md #237). Without it a
// connection that stalls (weak signal, a captive Wi-Fi page) keeps a call open for minutes, and at start the
// splash screen stays up the whole time. The Supabase client gets its fetch through withTimeout
// (src/lib/supabase.ts).

/** How long a call may wait for the server's answer, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The message of the error a timed-out call fails with. It contains "Network request failed", the
 * wording src/data/errors.ts isNetworkError reads, so screens show the usual "Could not reach the server"
 * and the auth client treats it as a network failure it may retry.
 */
export const TIMEOUT_MESSAGE = 'Network request failed: no answer within 15 s';

/**
 * Uploads to Storage send the whole file before the server answers, which on a slow phone connection takes
 * longer than the limit; they keep no time limit.
 */
function isUpload(address: string, method: string): boolean {
  return (method === 'POST' || method === 'PUT') && /\/storage\/v1\/(object|upload)\//.test(address);
}

/**
 * fetch with a time limit on the server's answer: a call with no answer (headers) within `ms` is
 * cancelled and fails with a TypeError(TIMEOUT_MESSAGE), like a call with no internet. The limit ends when
 * the answer starts, so a long download of a file is not cut off. A signal the caller passes still cancels
 * the call as before. Storage uploads are left without a limit (see isUpload).
 * @param base the fetch to wrap.
 * @param ms the limit in milliseconds.
 */
export function withTimeout(base: typeof fetch, ms: number = REQUEST_TIMEOUT_MS): typeof fetch {
  return async (input, init) => {
    const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    if (isUpload(address, method)) return base(input, init);

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
      }, ms);
    });
    try {
      return await Promise.race([base(input, { ...init, signal: controller.signal }), noAnswer]);
    } finally {
      clearTimeout(timer);
    }
  };
}
