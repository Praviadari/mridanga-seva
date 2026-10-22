// The printed papers of the adult face test (docs/phase3/ADULT_TEST.md, DECISIONS #433), made from that file so the
// printout never drifts from it: the tester consent (English master; Telugu and Hindi marked as drafts until the
// native review), one results sheet per tester (the checks of §2) and the deletion record (OPERATIONS.md "Face scan:
// deleting the test face data"). Writes adult-test-forms.html next to this file; with Microsoft Edge installed it also
// prints adult-test-forms.pdf (A4). Run from the repository root:
//   node docs/phase3/print/make-forms.mjs
// Plain Node, no packages.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = new URL('./', import.meta.url);
const md = readFileSync(new URL('../ADULT_TEST.md', here), 'utf8');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '$1');

/** The text under a heading, up to the next heading of the same or a higher level. */
function section(heading) {
  const start = md.indexOf(`\n${heading}\n`);
  if (start < 0) throw new Error(`ADULT_TEST.md has no "${heading}"`);
  const level = heading.match(/^#+/)[0].length;
  const rest = md.slice(start + heading.length + 2);
  const next = rest.search(new RegExp(`\\n#{1,${level}} `));
  return next < 0 ? rest : rest.slice(0, next);
}

/** Markdown paragraphs and "- " lists (as ADULT_TEST.md §1 writes them) to HTML. */
function blocks(text) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n');
      if (lines[0].startsWith('- ')) {
        const items = [];
        for (const line of lines) {
          if (line.startsWith('- ')) items.push(line.slice(2));
          else items[items.length - 1] += ` ${line.trim()}`;
        }
        return `<ul>${items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
      }
      const joined = lines.map((l) => l.trim()).join(' ');
      if (joined.startsWith('☐')) return `<p class="tick">${inline(joined)}</p>`;
      if (/_{6,}/.test(joined)) return `<p class="sign">${inline(joined).replace(/_{6,}/g, '<span class="line"></span>')}</p>`;
      return `<p>${inline(joined)}</p>`;
    })
    .join('\n');
}

const consent = (heading, lang, draft) => `
<section class="page" lang="${lang}">
  ${draft ? '<div class="draft">DRAFT — native review needed before use. Until then testers sign the English form.</div>' : ''}
  ${blocks(section(heading))}
  <p class="foot">Mridanga Seva · face scan test · ADULT_TEST.md §1 · form ${lang}${draft ? ' (draft)' : ''}</p>
</section>`;

// §2's checks table.
const checks = section('## 2. Test plan')
  .split('\n')
  .filter((l) => /^\| \d+ \|/.test(l))
  .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
if (checks.length < 10) throw new Error('the checks table of §2 was not found');

const results = `
<section class="page">
  <h2>Face scan test — results sheet</h2>
  <p>Tester code: T____ &nbsp; Phone model: ______________________ &nbsp; Android version: ______ &nbsp; Date: __________</p>
  <p class="small">Results by tester code only, never a name. Stop at once (face scan off on TEST, tell the lead) if check 7 or 8
  is ever accepted. Consent recorded in the app (C25) by: ______________ &nbsp; Enrolment confirmed by: ______________</p>
  <table>
    <thead><tr><th>#</th><th>Check</th><th>Expected</th><th>Result</th><th>Tries</th><th>Seconds</th></tr></thead>
    <tbody>${checks.map(([n, check, expected]) => `<tr><td>${esc(n)}</td><td>${inline(check)}</td><td>${inline(expected)}</td><td></td><td></td><td></td></tr>`).join('')}</tbody>
  </table>
  <p class="foot">Mridanga Seva · face scan test · ADULT_TEST.md §2</p>
</section>`;

const deletion = `
<section class="page">
  <h2>Face scan test — deletion record</h2>
  <p>Within 7 days of the last session (OPERATIONS.md "Face scan: deleting the test face data"). Last session: __________</p>
  <h3>1. Phones (at the desk)</h3>
  <table>
    <thead><tr><th>Tester</th><th>Face scan turned off</th><th>"Mridanga Seva TEST" uninstalled</th><th>Date</th><th>Desk</th></tr></thead>
    <tbody>${Array.from({ length: 10 }, (_, i) => `<tr><td>T${i + 1}</td><td>☐</td><td>☐</td><td></td><td></td></tr>`).join('')}</tbody>
  </table>
  <p class="small">A phone not brought back: write its tester code here and in NOTES_face_scan.md: ______________________</p>
  <h3>2. TEST server</h3>
  <p>Delete SQL run on TEST (fhuqyk…, never LIVE) by: ______________ on __________ at ______</p>
  <p>Verify row (expected <strong>false | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0</strong>): ____________________________________</p>
  <p>Testers told the deletion is done on: __________ &nbsp; by: ______________</p>
  <p class="small">The signed consent forms stay with the desk as the proof of consent (the Guru decides how long); they hold no face data.</p>
  <p class="foot">Mridanga Seva · face scan test · OPERATIONS.md "Face scan: deleting the test face data"</p>
</section>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Face scan test — forms</title>
<style>
  @page { size: A4; margin: 14mm 14mm 12mm; }
  body { font-family: "Segoe UI", "Nirmala UI", "Noto Sans", Arial, sans-serif; font-size: 10pt; line-height: 1.38; color: #000; margin: 0; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  p { margin: 0 0 6pt; }
  ul { margin: 0 0 6pt 14pt; padding: 0; }
  li { margin-bottom: 2pt; }
  h2 { font-size: 13pt; margin: 0 0 8pt; }
  h3 { font-size: 11pt; margin: 10pt 0 4pt; }
  .tick { margin-top: 10pt; font-size: 10.5pt; }
  .sign { margin-top: 16pt; }
  .line { display: inline-block; width: 38mm; border-bottom: 1px solid #000; margin: 0 4pt; }
  .draft { border: 2px solid #b00; color: #b00; font-weight: bold; padding: 4pt 6pt; margin-bottom: 8pt; }
  .small { font-size: 8.5pt; }
  .foot { font-size: 7.5pt; color: #555; margin-top: 10pt; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 6pt; }
  th, td { border: 1px solid #000; padding: 3pt 4pt; vertical-align: top; text-align: left; }
  td:nth-child(n+4) { width: 12mm; }
</style></head><body>
${consent('### English (master)', 'en', false)}
${consent('### తెలుగు — DRAFT, NATIVE REVIEW NEEDED', 'te', true)}
${consent('### हिन्दी — DRAFT, NATIVE REVIEW NEEDED', 'hi', true)}
${results}
${deletion}
</body></html>
`;

const htmlPath = fileURLToPath(new URL('adult-test-forms.html', here));
writeFileSync(htmlPath, html);
console.log(`Wrote ${htmlPath}`);

const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
if (edge) {
  const pdfPath = fileURLToPath(new URL('adult-test-forms.pdf', here));
  execFileSync(edge, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, htmlPath], { stdio: 'ignore' });
  console.log(`Wrote ${pdfPath}`);
} else {
  console.log('Microsoft Edge not found: open the HTML in a browser and print it to PDF (A4).');
}
