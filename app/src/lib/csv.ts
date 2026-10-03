// CSV text for the report export (C21, G8): comma-separated, every cell quoted when it needs to
// be, lines ending in CRLF, and a byte-order mark first, so Excel opens Telugu and Hindi names
// correctly. Saving the text is ./save-csv.ts (phone) and ./save-csv.web.ts (browser).

/** One cell: quoted when it holds a comma, a quote, a line break or leading/trailing spaces. */
function cell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  // A cell starting with = + - @ would be run as a formula by Excel: a leading apostrophe stops it.
  const safe = /^[=+\-@]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return /[",\r\n]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The rows as CSV text, the first row being the column headings. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}
