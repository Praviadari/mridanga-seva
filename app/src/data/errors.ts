// Helpers shared by the src/data/* files for reading errors that come back from Supabase.

/**
 * How each platform words a request that never reached the server: Chrome and Edge, Android and
 * iOS, Safari, Firefox (D6-05). supabase-js passes the wording on inside its error message.
 */
const NETWORK_WORDING = ['Failed to fetch', 'Network request failed', 'Load failed', 'NetworkError when attempting to fetch'];

/**
 * True when a Supabase call failed because the server could not be reached (no internet, server
 * paused), rather than because the database refused. supabase-js reports a failed network
 * request with the browser's or phone's own wording, which differs by platform.
 */
export function isNetworkError(message: string): boolean {
  return NETWORK_WORDING.some((words) => message.includes(words));
}
