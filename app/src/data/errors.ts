// Helpers shared by the src/data/* files for reading errors that come back from Supabase.

/**
 * True when a Supabase call failed because the server could not be reached (no internet, server
 * paused), rather than because the database refused. supabase-js reports a failed network
 * request with the browser's or phone's own wording, which differs by platform.
 */
export function isNetworkError(message: string): boolean {
  return message.includes('Failed to fetch') || message.includes('Network request failed');
}
