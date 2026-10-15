// Keeps a person signed in when Supabase Auth is busy (launch audit LA-04, docs/DECISIONS.md #393). The auth client
// (@supabase/auth-js 2.117) ends the login when a token refresh is refused with any answer but a 5xx or no answer,
// once the access token has expired, which is the usual case when the app is opened after an hour. Auth answers 429
// "too many requests" when one internet address refreshes too often (the token-refresh rate limit, GO_LIVE_CHECKLIST
// R5-02): many students on the temple's Wi-Fi, or behind one mobile operator's shared address, opening the app at the
// door at once. That 429 signed them out, and Sign out also deletes the My QR card saved on the phone. Here such a
// 429 fails like a call with no internet instead: the auth client keeps the login and tries again on its next tick,
// screens show "Could not reach the server", and My QR shows the saved card.

/** The message of that failure: "Network request failed" is what data/errors.ts isNetworkError reads. */
export const BUSY_REFRESH_MESSAGE = 'Network request failed: the sign-in server is busy (429)';

/**
 * True for the auth server's "too many requests" answer to a token refresh, the one answer turned into a network
 * failure. A refused sign-in with a password (also 429 when rate-limited) stays as it is: it shows its message.
 * @param address the call's web address. @param method the HTTP method in capitals. @param status the answer's status.
 */
export function isBusyRefresh(address: string, method: string, status: number): boolean {
  return status === 429 && method === 'POST' && /\/auth\/v1\/token\?(?:[^#]*&)?grant_type=refresh_token(?:&|#|$)/.test(address);
}

/**
 * fetch that fails a token refresh answered with 429 as a TypeError(BUSY_REFRESH_MESSAGE), like no internet.
 * @param base the fetch to wrap.
 */
export function refreshGuard(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await base(input, init);
    if (response.status !== 429) return response;
    const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    if (isBusyRefresh(address, method, response.status)) throw new TypeError(BUSY_REFRESH_MESSAGE);
    return response;
  };
}
