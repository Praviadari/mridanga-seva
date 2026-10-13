// Where the phone's lesson WebView (components/lesson-video-frame.tsx) may go (audit S5-06, docs/DECISIONS.md
// #285). The player page talks to the app through the WebView's message bridge, so no other page may
// take its place: a tap on YouTube's logo or "Watch on YouTube" opens YouTube outside the app, and
// anything else is stopped. Frames inside the page (YouTube's player) may load from any https
// address: they are another origin and cannot reach the bridge's page.

/** The address the player page says it comes from (its base URL; the Referer YouTube sees). Our own domain. */
export const PLAYER_BASE_URL = 'https://app.mridangaseva.com';

/** Hosts whose pages are YouTube's own (opened outside the app when the person taps through). */
const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com']);

/** What the WebView does with a page it is asked to load. */
export type LessonNavigation = 'allow' | 'open-outside' | 'block';

/**
 * Decides one load of the lesson WebView.
 * @param url the address asked for.
 * @param isTopFrame false for a frame inside the page (iOS reports it; Android only reports the page).
 */
export function lessonNavigation(url: string, isTopFrame: boolean | undefined): LessonNavigation {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'block';
  }
  // The page itself (loaded from a string) and the blank pages frames start with.
  if (parsed.protocol === 'about:' || parsed.protocol === 'data:' || parsed.protocol === 'blob:') return 'allow';
  if (isTopFrame === false) return parsed.protocol === 'https:' ? 'allow' : 'block';
  if (parsed.protocol !== 'https:') return 'block';
  if (parsed.origin === PLAYER_BASE_URL) return 'allow';
  if (YOUTUBE_HOSTS.has(parsed.hostname)) {
    // YouTube's player frame (Android may report a frame's load as the page's): stays in the app.
    if (parsed.pathname.startsWith('/embed/')) return 'allow';
    return 'open-outside';
  }
  return 'block';
}
