// Unit tests for the native additions of the 1.1.0 APK, round 3 of the 08-11-2026 release (docs/DECISIONS.md
// #800-#806): My QR's brightness, printing from the phone, Copy buttons, the kartal notification sound and its
// setting, https app links on the production app only, the taal player in the background, and the icon and splash
// drawn from the SVG masters. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const app = JSON.parse(file('app.json').toString('utf8')).expo;
const plugin = (name) => app.plugins.find((p) => (Array.isArray(p) ? p[0] : p) === name);
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));
const get = (obj, key) => key.split('.').reduce((o, k) => o?.[k], obj);

test('My QR: full brightness in view, the phone\'s again on leaving; window only, never WRITE_SETTINGS (#800)', () => {
  const screen = src('app/student/my-qr.tsx');
  assert.match(screen, /brightenScreen\(\)\.then/);
  assert.match(screen, /undoBright\?\.\(\)/);
  const native = src('lib/bright-screen.ts');
  assert.match(native, /setBrightnessAsync\(1\)/);
  assert.match(native, /restoreSystemBrightnessAsync/);
  assert.ok(!/setSystemBrightness/.test(native), 'the phone\'s own setting is never changed');
  assert.ok(!/from 'expo-brightness'/.test(src('lib/bright-screen.web.ts')), 'not in the web download');
  assert.equal(plugin('expo-brightness'), undefined, 'its plugin would add WRITE_SETTINGS');
  assert.ok(app.android.blockedPermissions.includes('android.permission.WRITE_SETTINGS'));
});

test('labels and QR cards print on the phone through expo-print on A4; the browser keeps its print dialog (#801)', () => {
  const native = src('components/label-print.tsx');
  assert.match(native, /Print\.printAsync\(\{ html: page, \.\.\.A4_POINTS \}\)/);
  assert.match(native, /A4_POINTS = \{ width: 595, height: 842 \}/);
  assert.match(native, /<div id="ms-label-print">\$\{html\}<\/div>/);
  assert.match(src('components/label-print.web.tsx'), /window\.print\(\)/);
  for (const screen of ['app/staff/inventory/labels.tsx', 'app/staff/qr-cards.tsx']) {
    const text = src(screen);
    assert.ok(!text.includes('webOnly'), `${screen}: no "web only" page any more`);
    assert.match(text, /printLabels\(html/);
    assert.match(text, /isWeb \? t\('labels\.printSettings'\) : t\('labels\.phonePrint'\)/);
  }
});

test('Copy buttons: expo-clipboard loaded on the first press, at the setup key, the privacy email, a crash (#802)', () => {
  const button = src('components/copy-button.tsx');
  assert.match(button, /await import\('expo-clipboard'\)/);
  assert.ok(!/^import .*expo-clipboard/m.test(button), 'not in the first download');
  assert.match(src('app/staff/my-sign-in-code.tsx'), /<CopyButton text=\{setup\.secret\}/);
  assert.match(src('screens/my-data-rights.tsx'), /<CopyButton text=\{PRIVACY_CONTACT\.email\}/);
  assert.match(src('components/crash-screen.tsx'), /<CopyButton text=\{errorDetail\(error\)\}/);
});

test('kartal_notify.wav: 22.05 kHz 16-bit mono, about a second, never clipped, the same on every run (#803)', () => {
  const wav = file('assets/sounds/notification/kartal_notify.wav');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 22050);
  assert.equal(wav.readUInt16LE(34), 16);
  const count = wav.readUInt32LE(40) / 2;
  assert.ok(count / 22050 >= 0.8 && count / 22050 <= 1.5, `${count / 22050} s`);
  let peak = 0;
  for (let i = 0; i < count; i++) peak = Math.max(peak, Math.abs(wav.readInt16LE(44 + 2 * i)));
  assert.ok(peak < 32767 * 0.75 && peak > 32767 * 0.6, `peak ${peak}`);
  assert.ok(Math.abs(wav.readInt16LE(44)) < 200, 'a quiet start');
  const before = createHash('sha256').update(wav).digest('hex');
  const run = spawnSync(process.execPath, ['scripts/make-kartal-sound.mjs'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(createHash('sha256').update(file('assets/sounds/notification/kartal_notify.wav')).digest('hex'), before);
});

test('notification sound setting: a second channel id per sound, never a changed one; khol until chosen (#803)', () => {
  const sound = src('lib/notify-sound.ts');
  assert.match(sound, /ANNOUNCE_CHANNEL: Record<NotifySound, string> = \{ khol: 'announcements-khol', kartal: 'announcements-kartal' \}/);
  assert.match(sound, /SOUND_FILE: Record<NotifySound, string> = \{ khol: 'khol_notify\.wav', kartal: 'kartal_notify\.wav' \}/);
  assert.match(sound, /readLocal\(KEY\) === 'kartal' \? 'kartal' : 'khol'/);
  const push = src('lib/push.ts');
  assert.match(push, /const CHANNEL_ID = 'announcements-khol';/, 'the channel the server sends with is still made');
  assert.match(push, /setNotificationChannelAsync\(ANNOUNCE_CHANNEL\.kartal/);
  assert.ok(!push.includes('deleteNotificationChannelAsync'));
  const profile = src('screens/my-profile.tsx');
  assert.match(profile, /Platform\.OS === 'android' \? \(\s*<Section icon="bell" title=\{t\('myProfile\.notifySound'\)\}/);
  // The server keeps the khol channel until 0074 tells it each phone's choice.
  const sender = readFileSync(new URL('../../supabase/functions/notify-announcements/messages.ts', import.meta.url), 'utf8');
  assert.match(sender, /export const CHANNEL_ID = 'announcements-khol';/);
});

test('app links: https://app.mridangaseva.com /i/ /student/ /staff/ verified; assetlinks only on the class site (#804)', () => {
  const [filter] = app.android.intentFilters;
  assert.equal(filter.action, 'VIEW');
  assert.equal(filter.autoVerify, true);
  assert.deepEqual(filter.category, ['BROWSABLE', 'DEFAULT']);
  assert.deepEqual(
    filter.data.map((d) => `${d.scheme}://${d.host}${d.pathPrefix}`),
    ['https://app.mridangaseva.com/i/', 'https://app.mridangaseva.com/student/', 'https://app.mridangaseva.com/staff/'],
  );
  const links = JSON.parse(file('public/.well-known/assetlinks.json').toString('utf8'));
  assert.equal(links[0].target.package_name, 'org.mridangaseva.app');
  assert.deepEqual(links[0].target.sha256_cert_fingerprints, ['__PRODUCTION_CERT_SHA256__']);
  const exporter = file('scripts/export-web.mjs').toString('utf8');
  assert.match(exporter, /if \(siteName === 'live'\) \{\s*if \(!\/\^\(\[0-9A-F\]\{2\}:\)\{31\}\[0-9A-F\]\{2\}\$\/\.test\(PRODUCTION_CERT_SHA256\)\)/);
  assert.match(exporter, /rmSync\(assetLinksFile, \{ force: true \}\)/);
  assert.match(file('public/_headers').toString('utf8'), /\/\.well-known\/assetlinks\.json\n {2}Content-Type: application\/json/);
});

test('taal player in the background: expo-audio plugin option, off by default, lock-screen player while on (#805)', () => {
  assert.equal(plugin('expo-audio')[1].enableBackgroundPlayback, true);
  const audio = src('lib/practice-audio.ts');
  assert.match(audio, /shouldPlayInBackground: this\.background/);
  assert.match(audio, /interruptionMode: this\.background \? 'doNotMix' : 'mixWithOthers'/);
  assert.match(audio, /setActiveForLockScreen\(true, \{ title: this\.title \}\)/);
  assert.match(audio, /let audioModeSet: boolean \| null = null;/);
  const screen = src('screens/practice-tools.tsx');
  assert.match(screen, /const \[background, setBackground\] = useState\(false\);/);
  assert.match(screen, /player\.setBackground\(background, lockTitle\)/);
  assert.match(src('lib/practice-audio.web.ts'), /setBackground\(on: boolean, title: string\): void/);
});

test('icon and splash from the SVG masters: every PNG there, one royal blue everywhere (#806)', () => {
  for (const name of ['make_app_icon_pillow.py', 'app_icon_pillow.svg', 'app_icon_pillow_text.svg']) {
    assert.ok(existsSync(new URL(`../assets/images/source/${name}`, import.meta.url)), name);
  }
  const size = (path) => {
    const png = file(path);
    assert.equal(png.toString('ascii', 1, 4), 'PNG', path);
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  };
  for (const [path, px] of [
    ['assets/images/icon.png', 1024],
    ['assets/images/android-icon-background.png', 1024],
    ['assets/images/android-icon-foreground.png', 1024],
    ['assets/images/android-icon-monochrome.png', 1024],
    ['assets/images/splash-icon.png', 1024],
    ['assets/images/favicon.png', 48],
    ['public/icon-192.png', 192],
    ['public/icon-512.png', 512],
    ['assets/images/facetest/icon.png', 1024],
  ]) {
    assert.deepEqual(size(path), [px, px], path);
  }
  const blue = '#1A2E90';
  assert.equal(app.android.adaptiveIcon.backgroundColor, blue);
  assert.equal(plugin('expo-splash-screen')[1].backgroundColor, blue);
  assert.equal(plugin('expo-splash-screen')[1].imageWidth, 240);
  assert.match(src('theme/colors.ts'), new RegExp(`export const brand = '${blue}';`));
  assert.match(src('components/brand.tsx'), /splashImage: \{\s*width: 240,/);
  assert.ok(!existsSync(new URL('../scripts/make-emblem-icons.mjs', import.meta.url)), 'the emblem script is replaced');
  const maker = file('scripts/make-app-icons.mjs').toString('utf8');
  assert.match(maker, /font-family="MsHeading"/, 'the lettering uses the app\'s heading font, not the PC\'s Georgia');
  assert.match(maker, /if \(safe && far > SAFE\) throw/);
});

test('round 3 texts: in English, Telugu and Hindi; the "web only" print pages are gone', () => {
  const keys = [
    'common.copy', 'common.copied', 'myCode.copyKey', 'dataRights.copyEmail', 'crash.copyDetail', 'labels.phonePrint',
    'push.channelNameKartal', 'practice.reminderChannelKartal', 'practice.background', 'practice.backgroundHint',
    'myProfile.notifySound', 'myProfile.notifySoundHint', 'myProfile.notifySoundChoices.khol', 'myProfile.notifySoundChoices.kartal',
  ];
  for (const lang of ['en', 'te', 'hi']) {
    const texts = locale(lang);
    for (const key of keys) assert.ok(get(texts, key), `${lang} ${key}`);
    for (const key of ['labels.webOnly', 'labels.webOnlyTitle', 'labels.openInBrowser', 'qrCards.webOnly']) {
      assert.equal(get(texts, key), undefined, `${lang} ${key}`);
    }
  }
});
