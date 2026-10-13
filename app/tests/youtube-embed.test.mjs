// Unit tests for audit S5-01 (phase 3, brief L7; docs/DECISIONS.md #282): a YouTube lesson in the browser plays
// in YouTube's own embed page, in its own origin and sandbox, driven by messages (src/lib/youtube-embed.ts);
// YouTube's scripts never run in the app's origin. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const yt = await import('../src/lib/youtube-embed.ts');

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const msg = (event, info) => JSON.stringify({ event, info });

// ---- S5-01: YouTube on the web --------------------------------------------------------------

test('S5-01: the web frame shows YouTube\'s embed in a sandbox and never loads the IFrame API script', () => {
  const frame = source('src/components/lesson-video-frame.web.tsx');
  assert.match(frame, /sandbox: YOUTUBE_FRAME_SANDBOX/);
  assert.doesNotMatch(frame, /iframe_api/);
  const sandbox = yt.YOUTUBE_FRAME_SANDBOX.split(' ');
  assert.ok(sandbox.includes('allow-scripts') && sandbox.includes('allow-same-origin'), 'YouTube\'s player needs both, in ITS origin');
  for (const never of ['allow-top-navigation', 'allow-top-navigation-by-user-activation', 'allow-forms', 'allow-downloads', 'allow-modals']) {
    assert.ok(!sandbox.includes(never), `${never} is not given`);
  }
  // Messages only from YouTube's origin and only from this frame; commands only to YouTube's origin.
  assert.match(frame, /e\.origin !== YOUTUBE_ORIGIN \|\| e\.source !== frame\.current\?\.contentWindow/);
  assert.match(frame, /postMessage\(m, YOUTUBE_ORIGIN\)/);
});

test('S5-01: the site policy no longer lets YouTube\'s scripts run in the app\'s origin', () => {
  const headers = source('public/_headers');
  const csp = headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:'));
  const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'));
  assert.doesNotMatch(scriptSrc, /youtube/);
  assert.match(csp, /frame-src https:\/\/www\.youtube\.com/, 'the embed frame itself is still allowed');
});

test('S5-01: the embed address carries the JS API switch, the app origin and nothing else odd', () => {
  const url = new URL(yt.youtubeEmbedUrl('abc_DEF-123', 'https://app.mridangaseva.com'));
  assert.equal(url.origin, yt.YOUTUBE_ORIGIN);
  assert.equal(url.pathname, '/embed/abc_DEF-123');
  assert.equal(url.searchParams.get('enablejsapi'), '1');
  assert.equal(url.searchParams.get('origin'), 'https://app.mridangaseva.com');
  assert.equal(url.searchParams.get('playsinline'), '1');
  assert.equal(new URL(yt.youtubeEmbedUrl('a/../b?x', 'https://x')).pathname, '/embed/a%2F..%2Fb%3Fx', 'the id cannot leave /embed/');
});

test('S5-01: "listening" until the embed answers, then ready with its speeds; "offline" if it never does', () => {
  const p = new yt.YouTubeEmbedPlayer(0);
  assert.deepEqual(p.tick(100).post, [yt.listeningMessage()]);
  assert.deepEqual(p.tick(200).post, [], 'at most every 250 ms');
  assert.deepEqual(p.command({ cmd: 'play' }, 300), { post: [], events: [] }, 'no commands before ready');
  const events = p.receive(yt.readYouTubeMessage(msg('initialDelivery', { duration: 90, playbackRate: 1, playerState: 5, currentTime: 0, availablePlaybackRates: [0.5, 1, 2] })), 400);
  assert.deepEqual(events, [{ event: 'ready', duration: 90, rates: [0.5, 1, 2] }]);
  assert.deepEqual(p.receive(yt.readYouTubeMessage(msg('onReady', null)), 450), [], 'ready only once');
  assert.deepEqual(p.tick(500).post, [], 'no more "listening" once it answered');
  assert.deepEqual(p.command({ cmd: 'hello' }, 600).events, [{ event: 'ready', duration: 90, rates: [0.5, 1, 2] }]);

  const silent = new yt.YouTubeEmbedPlayer(0);
  assert.deepEqual(silent.tick(yt.YOUTUBE_SILENT_MS + 1).events, [{ event: 'error', code: 'offline' }]);
  assert.deepEqual(silent.tick(yt.YOUTUBE_SILENT_MS + 500).events, [], 'said once');
});

test('S5-01: commands become YouTube\'s, speed checks the embed\'s list, errors keep the phone\'s codes', () => {
  const p = new yt.YouTubeEmbedPlayer(0);
  p.receive({ event: 'onReady', info: null }, 0);
  p.receive({ event: 'infoDelivery', info: { availablePlaybackRates: [0.25, 0.5, 1] } }, 0);
  const sent = (c) => p.command(c, 1000).post.map((m) => JSON.parse(m));
  assert.deepEqual(sent({ cmd: 'play' }), [{ event: 'command', func: 'playVideo', args: [], id: 1, channel: 'widget' }]);
  assert.equal(sent({ cmd: 'pause' })[0].func, 'pauseVideo');
  assert.deepEqual(sent({ cmd: 'seek', value: 12.5 })[0].args, [12.5, true]);
  assert.deepEqual(sent({ cmd: 'rate', value: 0.5 })[0].args, [0.5]);
  assert.deepEqual(p.command({ cmd: 'rate', value: 1.75 }, 0), { post: [], events: [{ event: 'error', code: 'rate_unavailable' }] });
  assert.deepEqual(sent({ cmd: 'mirror', value: true }), [], 'no mirror or zoom on YouTube (its terms)');
  assert.deepEqual(sent({ cmd: 'zoom', value: 1 }), []);
  assert.deepEqual(p.receive({ event: 'onError', info: 150 }, 0), [{ event: 'error', code: 'youtube_150' }]);
  assert.equal(yt.readYouTubeMessage('not json'), null);
  assert.equal(yt.readYouTubeMessage({ info: 1 }), null);
});

test('S5-01: the time counts on while playing, and the A-B loop jumps back to A', () => {
  const p = new yt.YouTubeEmbedPlayer(0);
  p.receive({ event: 'initialDelivery', info: { duration: 60, playbackRate: 1, playerState: 2, currentTime: 0 } }, 0);
  p.receive({ event: 'infoDelivery', info: { playerState: 1, currentTime: 10 } }, 1000);
  const state = p.tick(1500).events[0];
  assert.equal(state.event, 'state');
  assert.equal(state.playing, true);
  assert.ok(Math.abs(state.time - 10.5) < 1e-9, `half a second later: ${state.time}`);
  assert.deepEqual(p.command({ cmd: 'loop', value: { a: 11, b: 13 } }, 1500).post.map((m) => JSON.parse(m).args), [[11, true]], 'before A: jump to A');
  assert.deepEqual(p.tick(3000).post, [], 'inside the loop');
  assert.deepEqual(p.tick(3600).post.map((m) => JSON.parse(m).args), [[11, true]], 'past B: back to A');
  p.receive({ event: 'infoDelivery', info: { playerState: 2 } }, 3700);
  assert.equal(p.tick(9000).events[0].playing, false);
  assert.ok(Math.abs(p.tick(9000).events[0].time - 11.1) < 1e-9, 'paused: the time stands still');
});
