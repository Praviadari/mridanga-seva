// The V3 player page (lib/lesson-player-html.ts) in the browser: an iframe holding the same page
// as the phones' WebView (lesson-video-frame.tsx). Commands and events go by postMessage; the
// page's messages carry a tag, so other frames' messages are ignored.

import { createElement, forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

import {
  lessonPlayerHtml,
  PLAYER_MESSAGE_TAG,
  readPlayerEvent,
  type LessonSource,
  type PlayerCommand,
  type PlayerEvent,
} from '@/lib/lesson-player-html';

/** Props for LessonVideoFrame. */
export type LessonVideoFrameProps = {
  source: LessonSource;
  height: number;
  background: string;
  onEvent: (event: PlayerEvent) => void;
};

/** What the screen can do with the frame. */
export type LessonVideoFrameHandle = { send: (command: PlayerCommand) => void };

/** The player page in an iframe. */
export const LessonVideoFrame = forwardRef<LessonVideoFrameHandle, LessonVideoFrameProps>(function LessonVideoFrame(
  { source, height, background, onEvent },
  ref,
) {
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
    title: 'lesson video',
    allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture',
    allowFullScreen: true,
    style: { width: '100%', height, border: 0, display: 'block', backgroundColor: background },
  });
});
