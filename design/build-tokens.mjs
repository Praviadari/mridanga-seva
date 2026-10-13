// Writes the app's theme file and the website's CSS variables from design/tokens.json, then prints the
// contrast of every declared pair and stops (exit 1) when one is below its minimum (docs/DECISIONS.md #336).
// Run from the repository folder: node design/build-tokens.mjs   (--check: write nothing, fail if stale)

import { readFileSync, writeFileSync } from 'node:fs';

import { CSS_FILE, TS_FILE, contrastReport, loadTokens, renderCss, renderTs, repo } from './tokens.mjs';

const checkOnly = process.argv.includes('--check');
const tokens = loadTokens();
let failed = false;

for (const [file, text] of [
  [TS_FILE, renderTs(tokens)],
  [CSS_FILE, renderCss(tokens)],
]) {
  const url = new URL(file, repo);
  let current = '';
  try {
    current = readFileSync(url, 'utf8');
  } catch {
    // A new file.
  }
  if (current === text) {
    console.log(`same  ${file}`);
  } else if (checkOnly) {
    console.log(`STALE ${file}: run node design/build-tokens.mjs`);
    failed = true;
  } else {
    writeFileSync(url, text);
    console.log(`wrote ${file}`);
  }
}

const rows = contrastReport(tokens);
const low = rows.filter((r) => !r.ok);
const lowest = [...rows].sort((a, b) => a.ratio / a.min - b.ratio / b.min).slice(0, 5);
console.log(`\n${rows.length} contrast pairs, ${low.length} below their minimum. Closest to the line:`);
for (const r of lowest) console.log(`  ${r.ratio.toFixed(2)} (min ${r.min})  ${r.where}: ${r.fg} on ${r.bg}`);
for (const r of low) console.log(`LOW   ${r.ratio.toFixed(2)} < ${r.min}  ${r.where}: ${r.fg} on ${r.bg}`);
if (low.length) failed = true;
process.exit(failed ? 1 : 0);
