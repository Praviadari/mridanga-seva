// V3 lesson-video player (Phase 2 slice 4, docs/DECISIONS.md #52): the HTML page that plays one
// lesson. Phones show it in a WebView (components/lesson-video-frame.tsx), the browser in an iframe
// (lesson-video-frame.web.tsx), so both run exactly this code.
//
// - A YouTube lesson plays in YouTube's own embedded player through the IFrame Player API: speed
//   (setPlaybackRate), seeking and the A-B loop are API features. YouTube's terms allow no change
//   to its player's picture and nothing drawn over it, and need at least 200 x 200 px: so no mirror
//   and no zoom on YouTube, and the app's buttons sit under the player.
// - A video FILE (the team's own copy, materials kind 'video') plays in a <video> element; there
//   mirror (CSS scaleX(-1)) and "tap a pane to zoom" (one camera angle of a side-by-side video,
//   V2) are allowed.
// The app sends commands ({cmd, value}) and the page answers with events ({event, ...}):
// web: window.postMessage both ways; phone: injectJavaScript in, ReactNativeWebView.postMessage out.

/** What the page plays. */
export type LessonSource =
  | { kind: 'youtube'; videoId: string }
  | { kind: 'file'; url: string; panes: number };

/** A command from the app to the page. */
export type PlayerCommand =
  | { cmd: 'hello' }
  | { cmd: 'play' }
  | { cmd: 'pause' }
  | { cmd: 'seek'; value: number }
  | { cmd: 'rate'; value: number }
  | { cmd: 'mirror'; value: boolean }
  | { cmd: 'zoom'; value: number | null }
  | { cmd: 'loop'; value: { a: number; b: number } | null };

/** An event from the page to the app. */
export type PlayerEvent =
  | { event: 'ready'; duration: number; rates: number[] }
  | { event: 'state'; time: number; duration: number; playing: boolean; rate: number }
  | { event: 'aspect'; ratio: number }
  | { event: 'zoom'; pane: number | null }
  | { event: 'error'; code: string };

/** Marks the page's messages on the web, where other frames post messages too. */
export const PLAYER_MESSAGE_TAG = 'mridanga-lesson-player';

/** Reads a message from the page; null when it is not one. */
export function readPlayerEvent(data: unknown): PlayerEvent | null {
  let value = data;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const message = value as { tag?: unknown; event?: unknown };
  if (message.tag !== PLAYER_MESSAGE_TAG || typeof message.event !== 'string') return null;
  return value as PlayerEvent;
}

/** JSON safe inside a <script> element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * The page for one lesson. `origin` is the app's address (the browser's, or the WebView's base URL
 * on a phone): YouTube's player is told it, as its terms ask an embedding app to identify itself.
 */
export function lessonPlayerHtml(source: LessonSource, origin: string, background: string): string {
  const config = scriptJson({ source, origin, tag: PLAYER_MESSAGE_TAG });
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: ${background}; overflow: hidden; }
  #stage { position: relative; width: 100%; height: 100%; overflow: hidden; }
  #stage.mirror { transform: scaleX(-1); }
  #yt, #yt iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
  video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; background: #000; }
  video.zoomed { object-fit: fill; }
</style></head>
<body><div id="stage"></div>
<script>
(function () {
  var C = ${config};
  var stage = document.getElementById('stage');
  var rates = [1];
  var yt = null, video = null, ready = false, loop = null, mirror = false, zoom = null;
  var panes = C.source.kind === 'file' ? Math.max(1, Math.min(4, C.source.panes || 1)) : 1;

  function send(msg) {
    msg.tag = C.tag;
    var text = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
    else if (window.parent && window.parent !== window) window.parent.postMessage(text, '*');
  }
  function now() { return yt ? (yt.getCurrentTime() || 0) : video ? video.currentTime : 0; }
  function length() { return yt ? (yt.getDuration() || 0) : video && isFinite(video.duration) ? video.duration : 0; }
  function playing() {
    if (yt) return yt.getPlayerState() === 1;
    return !!video && !video.paused && !video.ended;
  }
  function rate() { return yt ? (yt.getPlaybackRate() || 1) : video ? video.playbackRate : 1; }
  function seek(t) { if (yt) yt.seekTo(t, true); else if (video) video.currentTime = t; }

  // The frame's shape: a file's own aspect (one pane's when zoomed); YouTube is 16:9.
  function sendAspect() {
    if (!video || !video.videoWidth || !video.videoHeight) return;
    var w = video.videoWidth / (zoom === null ? 1 : panes);
    send({ event: 'aspect', ratio: w / video.videoHeight });
  }
  function applyView() {
    stage.className = mirror ? 'mirror' : '';
    if (!video) return;
    if (zoom === null) {
      video.className = '';
      video.style.width = '100%';
      video.style.left = '0';
    } else {
      video.className = 'zoomed';
      video.style.width = (panes * 100) + '%';
      video.style.left = (-zoom * 100) + '%';
    }
    sendAspect();
  }

  window.__lessonCommand = function (c) {
    if (!c) return;
    // The app asks again once its frame has loaded: a fast page may have spoken before it listened.
    if (c.cmd === 'hello') { if (ready) { send({ event: 'ready', duration: length(), rates: rates }); sendAspect(); } return; }
    if (!ready) return;
    if (c.cmd === 'play') { if (yt) yt.playVideo(); else if (video) { var p = video.play(); if (p && p.catch) p.catch(function () { send({ event: 'error', code: 'play_blocked' }); }); } }
    else if (c.cmd === 'pause') { if (yt) yt.pauseVideo(); else if (video) video.pause(); }
    else if (c.cmd === 'seek') seek(Math.max(0, Number(c.value) || 0));
    else if (c.cmd === 'rate') {
      var r = Number(c.value) || 1;
      if (yt) {
        var offered = yt.getAvailablePlaybackRates() || [];
        if (offered.indexOf(r) < 0) { send({ event: 'error', code: 'rate_unavailable' }); return; }
        yt.setPlaybackRate(r);
      } else if (video) video.playbackRate = r;
    }
    // Mirror and zoom change the picture: only on the team's own files (YouTube's terms).
    else if (c.cmd === 'mirror') { if (video) { mirror = !!c.value; applyView(); } }
    else if (c.cmd === 'zoom') {
      if (!video) return;
      zoom = (c.value === null || panes < 2) ? null : Math.max(0, Math.min(panes - 1, Number(c.value) || 0));
      applyView();
    }
    else if (c.cmd === 'loop') {
      var v = c.value;
      loop = v && v.b > v.a + 0.2 ? { a: v.a, b: v.b } : null;
      if (loop && (now() < loop.a || now() >= loop.b)) seek(loop.a);
    }
  };
  window.addEventListener('message', function (e) {
    if (window.ReactNativeWebView) return;
    var c = e.data;
    if (typeof c === 'string') { try { c = JSON.parse(c); } catch (x) { return; } }
    if (c && c.tag === C.tag && c.cmd) window.__lessonCommand(c);
  });

  // The A-B loop and the state for the app's buttons, 10 times a second.
  setInterval(function () {
    if (!ready) return;
    var t = now();
    if (loop && playing() && t >= loop.b) { seek(loop.a); t = loop.a; }
    send({ event: 'state', time: t, duration: length(), playing: playing(), rate: rate() });
  }, 100);

  function becameReady(list) {
    if (ready) return;
    ready = true;
    rates = list;
    send({ event: 'ready', duration: length(), rates: rates });
  }

  if (C.source.kind === 'youtube') {
    var holder = document.createElement('div');
    holder.id = 'yt';
    stage.appendChild(holder);
    window.onYouTubeIframeAPIReady = function () {
      yt = new YT.Player('yt', {
        videoId: C.source.videoId,
        playerVars: { playsinline: 1, rel: 0, origin: C.origin, widget_referrer: C.origin },
        events: {
          onReady: function () { becameReady(yt.getAvailablePlaybackRates() || [1]); },
          onError: function (e) { send({ event: 'error', code: 'youtube_' + e.data }); }
        }
      });
    };
    var api = document.createElement('script');
    api.src = 'https://www.youtube.com/iframe_api';
    api.onerror = function () { send({ event: 'error', code: 'offline' }); };
    document.head.appendChild(api);
  } else {
    video = document.createElement('video');
    // A media fragment makes browsers paint the first frame before Play (else the box stays black).
    video.src = C.source.url.indexOf('#') < 0 ? C.source.url + '#t=0.001' : C.source.url;
    video.preload = 'metadata';
    video.controls = false;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    stage.appendChild(video);
    video.addEventListener('loadedmetadata', function () {
      becameReady([0.25, 0.5, 0.75, 1, 1.25, 1.5]);
      applyView();
    });
    video.addEventListener('error', function () { send({ event: 'error', code: 'file' }); });
    // Tap a pane to zoom it; tap again to see all of them.
    stage.addEventListener('click', function (e) {
      if (panes < 2) return;
      var box = stage.getBoundingClientRect();
      var f = (e.clientX - box.left) / box.width;
      if (mirror) f = 1 - f;
      zoom = zoom === null ? Math.max(0, Math.min(panes - 1, Math.floor(f * panes))) : null;
      applyView();
      send({ event: 'zoom', pane: zoom });
    });
  }
})();
</script></body></html>`;
}
