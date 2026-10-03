// The V3 player page (lib/lesson-player-html.ts) on Android and iOS: an OS WebView
// (react-native-webview, in the next planned APK; docs/DECISIONS.md #52), as YouTube asks of apps
// that embed its player. The page is loaded with a base URL so YouTube sees who embeds it (its
// terms ask for the HTTP Referer). The browser version is lesson-video-frame.web.tsx.

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import { lessonPlayerHtml, readPlayerEvent, type LessonSource, type PlayerCommand, type PlayerEvent } from '@/lib/lesson-player-html';

/** The address the page says it comes from (the Referer YouTube sees). */
export const PLAYER_BASE_URL = 'https://mridanga-seva.app';

/** Props for LessonVideoFrame. */
export type LessonVideoFrameProps = {
  source: LessonSource;
  height: number;
  background: string;
  onEvent: (event: PlayerEvent) => void;
};

/** What the screen can do with the frame. */
export type LessonVideoFrameHandle = { send: (command: PlayerCommand) => void };

/** The player page in a WebView. */
export const LessonVideoFrame = forwardRef<LessonVideoFrameHandle, LessonVideoFrameProps>(function LessonVideoFrame(
  { source, height, background, onEvent },
  ref,
) {
  const view = useRef<WebView>(null);
  const html = useMemo(() => lessonPlayerHtml(source, PLAYER_BASE_URL, background), [source, background]);

  useImperativeHandle(ref, () => ({
    send: (command) => {
      view.current?.injectJavaScript(`window.__lessonCommand && window.__lessonCommand(${JSON.stringify(command)}); true;`);
    },
  }));

  return (
    <WebView
      ref={view}
      originWhitelist={['*']}
      source={{ html, baseUrl: PLAYER_BASE_URL }}
      style={[styles.frame, { height, backgroundColor: background }]}
      onLoadEnd={() => view.current?.injectJavaScript('window.__lessonCommand && window.__lessonCommand({cmd:"hello"}); true;')}
      onMessage={(e) => {
        const event = readPlayerEvent(e.nativeEvent.data);
        if (event) onEvent(event);
      }}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      allowsFullscreenVideo
      javaScriptEnabled
      setSupportMultipleWindows={false}
      scrollEnabled={false}
    />
  );
});

const styles = StyleSheet.create({
  frame: {
    width: '100%',
  },
});
