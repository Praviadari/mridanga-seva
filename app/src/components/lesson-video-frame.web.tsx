// The lesson player in the browser. Commands and events have the same shapes as on the phones
// (lesson-video-frame.tsx), so the screen does not know which one runs:
// - a video FILE (the team's own copy) plays in the V3 player page (lib/lesson-player-html.ts) in a
//   srcdoc iframe, by postMessage; the page's messages carry a tag, so other frames' are ignored.
//   That page runs only its own script (pinned by hash in app/public/_headers) and a <video>.
// - a YouTube lesson plays in YouTube's own embed page, in its own origin and sandbox, driven by
//   messages (lib/youtube-embed.ts; audit S5-01, docs/DECISIONS.md #282). YouTube's script never runs
//   in the app's origin, where the login is kept.

import { createElement, forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import {
  lessonPlayerHtml,
  PLAYER_MESSAGE_TAG,
  readPlayerEvent,
  type LessonSource,
  type PlayerCommand,
  type PlayerEvent,
} from '@/lib/lesson-player-html';
import { readYouTubeMessage, YOUTUBE_FRAME_SANDBOX, YOUTUBE_ORIGIN, youtubeEmbedUrl, YouTubeEmbedPlayer } from '@/lib/youtube-embed';

/** Props for LessonVideoFrame. */
export type LessonVideoFrameProps = {
  source: LessonSource;
  height: number;
  background: string;
  onEvent: (event: PlayerEvent) => void;
};

/** What the screen can do with the frame. */
export type LessonVideoFrameHandle = { send: (command: PlayerCommand) => void };

const ALLOW = 'autoplay; encrypted-media; fullscreen; picture-in-picture';

/** The player in an iframe: YouTube's embed for a YouTube lesson, the player page for a file. */
export const LessonVideoFrame = forwardRef<LessonVideoFrameHandle, LessonVideoFrameProps>(function LessonVideoFrame(props, ref) {
  return props.source.kind === 'youtube'
    ? createElement(YouTubeFrame, { ...props, videoId: props.source.videoId, ref })
    : createElement(FileFrame, { ...props, ref });
});

/** Posts messages to YouTube's embed page (dropped by the browser while the frame is not YouTube's yet). */
function postToYouTube(frame: HTMLIFrameElement | null, messages: string[]): void {
  for (const m of messages) frame?.contentWindow?.postMessage(m, YOUTUBE_ORIGIN);
}

type YouTubeFrameProps = Omit<LessonVideoFrameProps, 'source'> & { videoId: string };

/** YouTube's embed page, driven by messages. */
const YouTubeFrame = forwardRef<LessonVideoFrameHandle, YouTubeFrameProps>(function YouTubeFrame({ videoId, height, background, onEvent }, ref) {
  const { t } = useTranslation();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const src = useMemo(() => youtubeEmbedUrl(videoId, window.location.origin), [videoId]);
  const player = useRef<YouTubeEmbedPlayer | null>(null);
  const listener = useRef(onEvent);
  listener.current = onEvent;

  const post = (messages: string[]) => postToYouTube(frame.current, messages);
  const emit = (events: PlayerEvent[]) => events.forEach((e) => listener.current(e));

  useImperativeHandle(ref, () => ({
    send: (command) => {
      if (command.cmd === 'exitFullscreen') {
        if (document.fullscreenElement && document.fullscreenElement === frame.current) void document.exitFullscreen().catch(() => undefined);
        return;
      }
      const p = player.current;
      if (!p) return;
      const { post: messages, events } = p.command(command, Date.now());
      post(messages);
      emit(events);
    },
  }));

  useEffect(() => {
    const post = (messages: string[]) => postToYouTube(frame.current, messages);
    const emit = (events: PlayerEvent[]) => events.forEach((e) => listener.current(e));
    const p = new YouTubeEmbedPlayer(Date.now());
    player.current = p;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== YOUTUBE_ORIGIN || e.source !== frame.current?.contentWindow) return;
      const message = readYouTubeMessage(e.data);
      if (message) emit(p.receive(message, Date.now()));
    };
    const onFullscreen = () => emit([{ event: 'fullscreen', on: !!frame.current && document.fullscreenElement === frame.current }]);
    const clock = setInterval(() => {
      const { post: messages, events } = p.tick(Date.now());
      post(messages);
      emit(events);
    }, 100);
    window.addEventListener('message', onMessage);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      clearInterval(clock);
      window.removeEventListener('message', onMessage);
      document.removeEventListener('fullscreenchange', onFullscreen);
      if (player.current === p) player.current = null;
    };
    // A new video is a new frame (src) and a new player.
  }, [src]);

  return createElement('iframe', {
    ref: frame,
    key: src,
    src,
    // The frame's name for screen readers, in the app's language (audit P1-05, #335).
    title: t('lessonPlayer.title'),
    sandbox: YOUTUBE_FRAME_SANDBOX,
    allow: ALLOW,
    allowFullScreen: true,
    referrerPolicy: 'strict-origin-when-cross-origin',
    style: { width: '100%', height, border: 0, display: 'block', backgroundColor: background },
  });
});

/** The V3 player page for a video file, in a srcdoc iframe. */
const FileFrame = forwardRef<LessonVideoFrameHandle, LessonVideoFrameProps>(function FileFrame({ source, height, background, onEvent }, ref) {
  const { t } = useTranslation();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const html = useMemo(() => lessonPlayerHtml(source, window.location.origin, background), [source, background]);
  const listener = useRef(onEvent);
  listener.current = onEvent;

  useImperativeHandle(ref, () => ({
    send: (command) => frame.current?.contentWindow?.postMessage(JSON.stringify({ ...command, tag: PLAYER_MESSAGE_TAG }), '*'),
  }));

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const event = readPlayerEvent(e.data);
      if (event) listener.current(event);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return createElement('iframe', {
    ref: frame,
    srcDoc: html,
    // The frame's name for screen readers, in the app's language (audit P1-05, #335).
    title: t('lessonPlayer.title'),
    allow: ALLOW,
    allowFullScreen: true,
    onLoad: () => frame.current?.contentWindow?.postMessage(JSON.stringify({ cmd: 'hello', tag: PLAYER_MESSAGE_TAG }), '*'),
    style: { width: '100%', height, border: 0, display: 'block', backgroundColor: background },
  });
});
