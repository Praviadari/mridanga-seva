// Guards on files that change what runs at build, deploy or in an AI agent's session
// (docs/DECISIONS.md #198, #199). Run from app/: node --test tests/repo-guards.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const repo = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, repo), 'utf8');

test('package.json has no script that EAS Build would run but the settings guard (the fingerprint ignores scripts, D11-09)', () => {
  const scripts = JSON.parse(read('app/package.json')).scripts ?? {};
  const hooks = Object.keys(scripts).filter((name) =>
    /^(pre|post)?install$|^prepare$|^prepublish$|^eas-build-/.test(name),
  );
  // The one allowed hook only reads the build's settings and stops a wrong build; it changes no file (#256).
  assert.deepEqual(hooks, ['eas-build-pre-install'], 'a build hook can change the APK unseen: build a new APK, see app/fingerprint.config.js');
  assert.equal(scripts['eas-build-pre-install'], 'node scripts/eas-build-guard.mjs');
});

test('the build guard imports nothing but Node and its project list (it runs before npm install)', () => {
  for (const file of ['app/scripts/eas-build-guard.mjs', 'app/scripts/lib/supabase-projects.mjs']) {
    const imports = [...read(file).matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    for (const name of imports) {
      assert.match(name, /^node:|^\.\/lib\/supabase-projects\.mjs$/, `${file} imports ${name}`);
    }
  }
});

test('tracked agent settings only switch plugins on: no hooks, permissions or environment (D11-20)', () => {
  const run = spawnSync('git', ['ls-files', '*.claude/*', '.claude/*'], { cwd: repo, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const files = run.stdout.split('\n').filter(Boolean);
  for (const file of files) {
    assert.match(file, /(^|\/)\.claude\/settings\.json$/, `${file}: only a settings.json belongs in git`);
    const keys = Object.keys(JSON.parse(read(file)));
    assert.deepEqual(keys.filter((key) => key !== 'enabledPlugins'), [], `${file}: only enabledPlugins may be tracked`);
  }
});

test('the Edge Function imports supabase-js at an exact version (D2-10)', () => {
  const imports = read('supabase/functions/notify-announcements/index.ts').match(/npm:@supabase\/supabase-js@[^'"]*/g);
  assert.equal(imports?.length, 1);
  assert.match(imports[0], /@\d+\.\d+\.\d+$/, `${imports[0]}: pin an exact version, not a range`);
});
