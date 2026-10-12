// The characters a person's name may not hold, computed from JavaScript's Unicode tables exactly as
// the app's checkPersonName decides (app/src/lib/person-name.ts, DECISIONS #267/#271): everything that
// is not a letter or mark (\p{L}, \p{M}), ZWNJ/ZWJ, a separator (space . ' ’ -) or white space (\s,
// which the cleaning turns into a space). PostgreSQL's regular expressions have no \p{…}, so 0047's
// person_name_symbols() holds this list as code-point ranges; the smoke test checks the two agree.
// Run `node name-symbols.mjs` to print the SQL string after a Node (Unicode) upgrade.

const allowed = /^[\p{L}\p{M}‌‍ .'’\-]$/u;
const space = /^\s$/u;

/** The refused code points as [from, to] ranges (surrogates left out: they are never a whole character). */
export function symbolRanges() {
  const ranges = [];
  let start = -1;
  for (let c = 1; c <= 0x10ffff; c++) {
    const refused = !(c >= 0xd800 && c <= 0xdfff) && !allowed.test(String.fromCodePoint(c)) && !space.test(String.fromCodePoint(c));
    if (refused && start < 0) start = c;
    if (!refused && start >= 0) { ranges.push([start, c - 1]); start = -1; }
  }
  if (start >= 0) ranges.push([start, 0x10ffff]);
  return ranges;
}

const esc = (c) => (c <= 0xffff ? `\\u${c.toString(16).padStart(4, '0')}` : `\\U${c.toString(16).padStart(8, '0')}`);

/** The bracket body as person_name_symbols() returns it. */
export function symbolBracket() {
  return symbolRanges().map(([a, b]) => (a === b ? esc(a) : `${esc(a)}-${esc(b)}`)).join('');
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const body = symbolBracket();
  console.log(`-- ${symbolRanges().length} ranges, ${body.length} characters, Unicode ${process.versions.unicode}`);
  console.log(body);
}
