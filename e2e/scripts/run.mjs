// npm run e2e: makes sure app/dist is the TEST export of the app as committed here, then runs
// Playwright (e2e/README.md). Arguments after -- go to Playwright (e.g. -- --project chromium).
//   --build        export again even when app/dist is current
//   --build-only   export (when needed) and stop
// The export is the same command as for the TEST site (npm run export:web -- --site test); a dist/
// built for any other site or project is never tested, it is rebuilt.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { APP_DIR, DIST_DIR, E2E_DIR, e2eLogins, TEST_PROJECT, testProject } from './lib/env.mjs';

const args = process.argv.slice(2);
const own = new Set(['--build', '--build-only']);
const passOn = args.filter((a) => !own.has(a));
const isWindows = process.platform === 'win32';

function run(cmd, cmdArgs, cwd) {
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: 'inherit', shell: isWindows });
  return r.status ?? 1;
}

function git(gitArgs) {
  return spawnSync('git', gitArgs, { cwd: APP_DIR, encoding: 'utf8', shell: isWindows });
}

/** Why app/dist must be exported again, or null when it is the TEST export of the app as committed at HEAD. */
function staleReason() {
  const file = join(DIST_DIR, 'version.txt');
  if (!existsSync(file)) return 'app/dist has no TEST export yet';
  const text = readFileSync(file, 'utf8');
  if (!/^site test$/m.test(text) || !text.includes(`project ${TEST_PROJECT}`)) return 'app/dist is not the TEST site';
  const built = /^commit (\S+)$/m.exec(text)?.[1];
  if (!built) return 'app/dist does not say which commit it was built from';
  // Commits that change only e2e/ or docs/ leave the export as it was; any change under app/ needs a new one.
  const diff = git(['diff', '--quiet', built, 'HEAD', '--', '.']);
  if (diff.status === 1) return `app/ changed since ${built}`;
  if (diff.status !== 0) return `commit ${built} of app/dist is not known here`;
  return null;
}

try {
  testProject();
  if (!args.includes('--build-only')) e2eLogins();
} catch (e) {
  console.error('e2e: ' + e.message);
  process.exit(1);
}

const reason = args.includes('--build') ? 'asked for --build' : staleReason();
if (reason) {
  console.log(`e2e: exporting the TEST site (${reason}); takes a few minutes.`);
  if (run('npm', ['run', 'export:web', '--', '--site', 'test'], APP_DIR) !== 0) process.exit(1);
  const still = staleReason();
  if (still) {
    console.error('e2e: the export did not give a TEST build of HEAD: ' + still);
    process.exit(1);
  }
} else {
  console.log('e2e: app/dist is the TEST export of the app at HEAD; not exported again (--build forces it).');
}
if (args.includes('--build-only')) process.exit(0);

// Uncommitted app changes are not in a dist/ labelled with a commit: say so rather than test old code silently.
const dirty = git(['status', '--porcelain', '--', '.']);
if (dirty.stdout?.trim() && !args.includes('--build')) {
  console.warn('e2e: app/ has uncommitted changes; run npm run e2e -- --build to test them.');
}

process.exit(run('npx', ['playwright', 'test', ...passOn], E2E_DIR));
