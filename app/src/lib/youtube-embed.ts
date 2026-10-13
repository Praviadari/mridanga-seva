// A YouTube lesson in the browser (components/lesson-video-frame.web.tsx; audit S5-01, docs/DECISIONS.md
// #282): YouTube's own embed page in an iframe of its own origin, driven by the messages YouTube's
// IFrame Player API itself sends to that page. The API's script (www.youtube.com/iframe_api) is never
// loaded into the app, so code from YouTube cannot reach the app's origin, where the login is kept.
//
// The messages, as the API and other players (vidstack) use them:
// - the app sends {"event":"listening"} until the embed answers; the embed then reports its state as
//   {"event":"initialDelivery" | "infoDelivery", "info": {currentTime, duration, playbackRate,
//   playerState, availablePlaybackRates, ...}}, and {"event":"onReady"} / {"event":"onError","info":150};
// - the app sends {"event":"command","func":"playVideo","args":[]} (pauseVideo, seekTo, setPlaybackRate).
// This module is that protocol and the player's bookkeeping (speed, A-B loop, state 10 times a second),
// without the DOM, so the tests can run it. Phones keep the player page (lib/lesson-player-html.ts) in
// a WebView, which is not the app's origin.

import type { PlayerCommand, PlayerEvent } from './lesson-player-html';

/** The origin of YouTube's embed page; its messages are accepted from here only. */
export const YOUTUBE_ORIGIN = 'https://www.youtube.com';

/**
 * The frame's sandbox: scripts and its own origin (YouTube's player needs both; the origin is
 * YouTube's, not the app's), fullscreen presentation, and "Watch on YouTube" opening a normal tab.
 * Not allowed: navigating the app's page, forms, downloads, pointer lock.
 */
export const YOUTUBE_FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox';

/** How long the embed may stay silent before the lesson shows "no internet". */
export const YOUTUBE_SILENT_MS = 15000;

/** Speeds offered when the embed does not list its own. */
const DEFAULT_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** The embed page's address for one video. `origin` is the app's (YouTube posts its messages there). */
export function youtubeEmbedUrl(videoId: string, origin: string): string {
  const params = new URLSearchParams({
    enablejsapi: '1',
    playsinline: '1',
    rel: '0',
    origin,
    widget_referrer: origin,
  });
  return `${YOUTUBE_ORIGIN}/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}

/** The message that asks the embed to start reporting. */
export function listeningMessage(): string {
  return JSON.stringify({ event: 'listening', id: 1, channel: 'widget' });
}

/** A command message for the embed. */
export function commandMessage(func: string, args: unknown[] = []): string {
  return JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' });
}

/** A message from the embed. */
export type YouTubeMessage = { event: string; info: unknown };

/** Reads a message from the embed; null when it is not one. */
export function readYouTubeMessage(data: unknown): YouTubeMessage | null {
  let value = data;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const message = value as { event?: unknown; info?: unknown };
  if (typeof message.event !== 'string') return null;
  return { event: message.event, info: message.info ?? null };
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * One YouTube lesson's player state. The frame feeds it the embed's messages (receive), the screen's
 * commands (command) and a clock tick (tick); each returns what to post to the embed and which
 * events to give the screen, in the same shapes as the phone's player page.
 */
export class YouTubeEmbedPlayer {
  private ready = false;
  private heard = false;
  private time = 0;
  /** When `time` was last reported (ms), to count on while playing. */
  private timeAt = 0;
  private duration = 0;
  private rate = 1;
  private state = -1;
  private rates: number[] = DEFAULT_RATES;
  private loop: { a: number; b: number } | null = null;
  private startedAt: number;
  private listenedAt = Number.NEGATIVE_INFINITY;

  constructor(now: number) {
    this.startedAt = now;
  }

  /** True once the embed has answered anything. */
  get answered(): boolean {
    return this.heard;
  }

  private playing(): boolean {
    return this.state === 1;
  }

  /** The time now: the last reported time, counted on at the current speed while playing. */
  currentTime(now: number): number {
    if (!this.playing()) return this.time;
    const t = this.time + ((now - this.timeAt) / 1000) * this.rate;
    return this.duration > 0 ? Math.min(t, this.duration) : t;
  }

  private stateEvent(now: number): PlayerEvent {
    return { event: 'state', time: this.currentTime(now), duration: this.duration, playing: this.playing(), rate: this.rate };
  }

  /** A message from the embed. */
  receive(message: YouTubeMessage, now: number): PlayerEvent[] {
    this.heard = true;
    const events: PlayerEvent[] = [];
    const info = message.info;
    if (message.event === 'onError') {
      events.push({ event: 'error', code: `youtube_${isNumber(info) ? info : 'unknown'}` });
      return events;
    }
    if (info && typeof info === 'object') {
      const i = info as Record<string, unknown>;
      const progress = i.progressState && typeof i.progressState === 'object' ? (i.progressState as Record<string, unknown>) : null;
      const reported = isNumber(i.currentTime) ? i.currentTime : progress && isNumber(progress.current) ? progress.current : null;
      if (reported !== null) {
        this.time = reported;
        this.timeAt = now;
      }
      if (isNumber(i.duration) && i.duration > 0) this.duration = i.duration;
      if (isNumber(i.playbackRate) && i.playbackRate > 0) this.rate = i.playbackRate;
      if (isNumber(i.playerState)) {
        // Counting on from the last report must not jump when playing stops or starts.
        if (this.playing() !== (i.playerState === 1) && reported === null) {
          this.time = this.currentTime(now);
          this.timeAt = now;
        }
        this.state = i.playerState;
      }
      if (Array.isArray(i.availablePlaybackRates)) {
        const list = i.availablePlaybackRates.filter(isNumber);
        if (list.length > 0) this.rates = list;
      }
    } else if (message.event === 'onStateChange' && isNumber(info)) {
      this.time = this.currentTime(now);
      this.timeAt = now;
      this.state = info;
    }
    if (!this.ready && (message.event === 'onReady' || message.event === 'initialDelivery')) {
      this.ready = true;
      events.push({ event: 'ready', duration: this.duration, rates: this.rates });
    }
    return events;
  }

  /** A command from the screen: the messages to post to the embed and any events back. */
  command(c: PlayerCommand, now: number): { post: string[]; events: PlayerEvent[] } {
    if (c.cmd === 'hello') return { post: [], events: this.ready ? [{ event: 'ready', duration: this.duration, rates: this.rates }] : [] };
    if (!this.ready) return { post: [], events: [] };
    if (c.cmd === 'play') return { post: [commandMessage('playVideo')], events: [] };
    if (c.cmd === 'pause') return { post: [commandMessage('pauseVideo')], events: [] };
    if (c.cmd === 'seek') return { post: this.seek(Math.max(0, Number(c.value) || 0), now), events: [] };
    if (c.cmd === 'rate') {
      const r = Number(c.value) || 1;
      if (!this.rates.includes(r)) return { post: [], events: [{ event: 'error', code: 'rate_unavailable' }] };
      this.time = this.currentTime(now);
      this.timeAt = now;
      this.rate = r;
      return { post: [commandMessage('setPlaybackRate', [r])], events: [] };
    }
    if (c.cmd === 'loop') {
      const v = c.value;
      this.loop = v && v.b > v.a + 0.2 ? { a: v.a, b: v.b } : null;
      const t = this.currentTime(now);
      if (this.loop && (t < this.loop.a || t >= this.loop.b)) return { post: this.seek(this.loop.a, now), events: [] };
      return { post: [], events: [] };
    }
    // Mirror and zoom change the picture: never on YouTube (its terms). Fullscreen is the frame's.
    return { post: [], events: [] };
  }

  private seek(t: number, now: number): string[] {
    this.time = t;
    this.timeAt = now;
    return [commandMessage('seekTo', [t, true])];
  }

  /**
   * The clock, 10 times a second: the A-B loop, the state for the screen's buttons, "listening"
   * until the embed answers, and "no internet" when it never does.
   */
  tick(now: number): { post: string[]; events: PlayerEvent[] } {
    if (!this.heard) {
      if (now - this.startedAt > YOUTUBE_SILENT_MS) {
        this.startedAt = Number.POSITIVE_INFINITY;
        return { post: [], events: [{ event: 'error', code: 'offline' }] };
      }
      if (now - this.listenedAt < 250) return { post: [], events: [] };
      this.listenedAt = now;
      return { post: [listeningMessage()], events: [] };
    }
    if (!this.ready) return { post: [], events: [] };
    const post = this.loop && this.playing() && this.currentTime(now) >= this.loop.b ? this.seek(this.loop.a, now) : [];
    return { post, events: [this.stateEvent(now)] };
  }
}
