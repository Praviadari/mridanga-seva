// Which code an update would carry, read from git, for scripts/publish-update.mjs. The update is bundled from
// the files on disk, so a production update published from a worker's branch, with edits not yet committed or
// with a commit not yet on GitHub would give the class code nobody checked (launch audit LA-16, docs/DECISIONS.md
// #395). Production therefore publishes only from a clean `main` that equals `origin/main`; preview may publish
// anything that is being tried, and is only told. Plain Node, no packages.

import { spawnSync } from 'node:child_process';

/** Runs git with `args` in the current folder; its output, or null when git is missing or failed. */
export function runGit(args) {
  const run = spawnSync('git', args, { encoding: 'utf8' });
  return run.status === 0 ? run.stdout : null;
}

/**
 * What git says about the code that would be published: `problems` stop a production update (for preview they are
 * printed as warnings), `commit` is the short id of what is published.
 * @param {(args: string[]) => string | null} git runs git (runGit, or a stand-in in tests)
 */
export function releaseGitState(git = runGit) {
  const status = git(['status', '--porcelain']);
  if (status === null) {
    return {
      problems: ['git does not run in this terminal (eas update needs it too). Add it to the path, for example ' +
        '$env:Path = "$env:LOCALAPPDATA\\Programs\\Git\\cmd;$env:Path", and try again.'],
      commit: null,
    };
  }
  const problems = [];
  const branch = (git(['rev-parse', '--abbrev-ref', 'HEAD']) ?? '').trim();
  const head = (git(['rev-parse', 'HEAD']) ?? '').trim();
  const pushed = (git(['rev-parse', '--verify', '--quiet', 'origin/main']) ?? '').trim();
  if (branch !== 'main') problems.push(`this folder is on ${branch || 'no branch'}, not main.`);
  const changed = status.split('\n').filter((line) => line.trim() !== '');
  if (changed.length > 0) {
    problems.push(`${changed.length} file(s) changed or new and not committed (git status), e.g. ${changed[0].slice(3)}.`);
  }
  if (!pushed) problems.push('origin/main is unknown here (git fetch).');
  else if (head !== pushed) problems.push('this commit is not origin/main (git pull, or push the merge first).');
  return { problems, commit: head ? head.slice(0, 7) : null };
}
