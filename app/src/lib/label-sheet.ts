// Builds the printable A4 sheet of asset labels (docs/DECISIONS.md #158) as plain HTML laid out in
// millimetres, for the web print page (src/app/staff/inventory/labels.tsx). The label stock is
// Avery L7161 / J8161 type: 18 labels, 3 across and 6 down, each 63.5 x 46.6 mm (Praveen's pack,
// 07-10-2026). The browser must print at 100 % ("Actual size"), margins none; the calibration
// sheet (outlines, centre marks and a 100 mm ruler) checks that on plain paper first.
// No scripts in the HTML: the page's Content-Security-Policy allows inline styles only.

import { qrShape } from '@/components/qr-code';

/** The label stock, in mm. Change here only for another pack (and note it in DECISIONS #158). */
export const SHEET = {
  pageWidth: 210,
  pageHeight: 297,
  columns: 3,
  rows: 6,
  labelWidth: 63.5,
  labelHeight: 46.6,
  /** Page edge to the first column's left edge. */
  left: 7.2,
  /** Page edge to the first row's top edge. */
  top: 8.8,
  /** Left edge to left edge of neighbouring columns (63.5 + a 2.5 mm gap). */
  columnPitch: 66.0,
  /** Top edge to top edge of neighbouring rows (rows touch). */
  rowPitch: 46.6,
} as const;

/** Labels on one sheet. */
export const PER_SHEET = SHEET.columns * SHEET.rows;

/** The QR code's printed size with its quiet zone, in mm (the code itself is about 24 mm). */
export const QR_MM = 30;

/** Largest printer shift the page accepts, in mm either way. */
export const NUDGE_MAX = 5;

/** One label's printed content, already translated. */
export type LabelContent = {
  /** The link in the QR code (src/lib/asset-link.ts). */
  link: string;
  /** Big code, e.g. KHOL-007. */
  code: string;
  /** "Fibreglass mridanga · Abids" */
  kindLine: string;
  /** The item's own name, e.g. "Balaram blue 3". */
  name: string;
};

/** Fixed lines of every label, already translated. */
export type LabelTexts = { brand: string; finder: string; calibrationTitle: string; calibrationHelp: string; ruler: string };

export type SheetOptions = {
  /** 1-18: the first free label on the first sheet (a half-used sheet). */
  startAt: number;
  /** Draw label outlines, centre marks and a ruler (calibration on plain paper). */
  calibration: boolean;
  /** Printer shift to correct, in mm: + moves right / down. */
  nudgeX: number;
  nudgeY: number;
};

/** Escapes text for HTML. */
function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A number written for CSS with at most two decimals. */
function mm(value: number): string {
  return `${Math.round(value * 100) / 100}mm`;
}

/** The QR code as inline SVG, QR_MM square including its quiet zone, black on white. */
function qrSvg(link: string): string {
  const { path, modules, quietZone } = qrShape(link);
  const box = modules + quietZone * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${QR_MM}mm" height="${QR_MM}mm" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="${box}" height="${box}" fill="#fff"/>` +
    `<path d="${path}" fill="#000"/></svg>`
  );
}

/** Where label `index` (0-17) sits on the page, in mm from the top left corner. */
export function labelPosition(index: number, nudgeX = 0, nudgeY = 0): { x: number; y: number } {
  const column = index % SHEET.columns;
  const row = Math.floor(index / SHEET.columns);
  return { x: SHEET.left + column * SHEET.columnPitch + nudgeX, y: SHEET.top + row * SHEET.rowPitch + nudgeY };
}

/** How many sheets `count` labels take when the first sheet starts at `startAt`. */
export function sheetsNeeded(count: number, startAt: number): number {
  return count === 0 ? 0 : Math.ceil((count + startAt - 1) / PER_SHEET);
}

/** The CSS of the sheet: the page box, the labels, and printing only the sheet (#ms-label-print). */
export const SHEET_CSS = `
.ms-sheet{position:relative;width:${SHEET.pageWidth}mm;height:${SHEET.pageHeight}mm;background:#fff;color:#000;overflow:hidden;
  box-sizing:border-box;font-family:Arial,"Noto Sans","Noto Sans Telugu","Noto Sans Devanagari",sans-serif;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.ms-label{position:absolute;width:${SHEET.labelWidth}mm;height:${SHEET.labelHeight}mm;box-sizing:border-box;overflow:hidden}
.ms-label .qr{position:absolute;left:1mm;top:1.5mm;width:${QR_MM}mm;height:${QR_MM}mm}
.ms-label .qr svg{display:block}
.ms-label .text{position:absolute;left:${QR_MM + 1.5}mm;right:3mm;top:4mm;display:flex;flex-direction:column;gap:1mm}
.ms-label .brand{font-size:7pt;font-weight:700;letter-spacing:.02em}
.ms-label .code{font-size:14pt;font-weight:700;line-height:1.05;word-break:break-all}
.ms-label .kind{font-size:6.5pt;line-height:1.2}
.ms-label .name{font-size:7pt;font-weight:700;line-height:1.2;max-height:8.5mm;overflow:hidden}
.ms-label .finder{position:absolute;left:3mm;right:3mm;bottom:3mm;font-size:6pt;line-height:1.2;text-align:center}
.ms-outline{position:absolute;border:0.2mm dashed #888;border-radius:2.5mm;box-sizing:border-box;width:${SHEET.labelWidth}mm;height:${SHEET.labelHeight}mm}
.ms-cross{position:absolute;width:4mm;height:4mm;margin:-2mm 0 0 -2mm;
  background:linear-gradient(#888,#888) center/0.2mm 100% no-repeat,linear-gradient(#888,#888) center/100% 0.2mm no-repeat}
.ms-cal{position:absolute;left:20mm;top:${SHEET.pageHeight / 2 - 12}mm;width:170mm;font-size:8pt;text-align:center;
  background:#fff;border:0.2mm solid #000;padding:2mm;box-sizing:border-box}
.ms-ruler{margin:2mm auto 0;width:100mm;height:3mm;border:0.2mm solid #000;border-top:none;box-sizing:border-box;
  background:repeating-linear-gradient(to right,#000 0 0.2mm,transparent 0.2mm 10mm)}
@media screen{#ms-label-print{display:none}}
@media print{
  @page{size:A4 portrait;margin:0}
  html,body{margin:0!important;padding:0!important;height:auto!important;overflow:visible!important;background:#fff!important}
  body>*:not(#ms-label-print){display:none!important}
  #ms-label-print{display:block!important}
  #ms-label-print .ms-sheet{break-after:page;page-break-after:always}
  #ms-label-print .ms-sheet:last-child{break-after:auto;page-break-after:auto}
}
`;

/**
 * The HTML of every sheet needed for `labels`, starting at options.startAt on the first sheet.
 * With options.calibration each label position also gets its outline and centre mark, and the
 * first sheet a box with the 100 mm ruler; with no labels the calibration sheet is outlines only.
 */
export function sheetHtml(labels: LabelContent[], texts: LabelTexts, options: SheetOptions): string {
  const start = Math.min(Math.max(Math.round(options.startAt), 1), PER_SHEET) - 1;
  const nudgeX = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, options.nudgeX || 0));
  const nudgeY = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, options.nudgeY || 0));
  const sheets = Math.max(1, sheetsNeeded(labels.length, start + 1));
  const pages: string[] = [];
  let next = 0;
  for (let sheet = 0; sheet < sheets; sheet++) {
    const parts: string[] = [];
    for (let slot = 0; slot < PER_SHEET; slot++) {
      const { x, y } = labelPosition(slot, nudgeX, nudgeY);
      if (options.calibration) {
        parts.push(`<div class="ms-outline" style="left:${mm(x)};top:${mm(y)}"></div>`);
        parts.push(`<div class="ms-cross" style="left:${mm(x + SHEET.labelWidth / 2)};top:${mm(y + SHEET.labelHeight / 2)}"></div>`);
      }
      if (sheet === 0 && slot < start) continue;
      const label = labels[next];
      if (!label) continue;
      next++;
      parts.push(
        `<div class="ms-label" style="left:${mm(x)};top:${mm(y)}">` +
          `<div class="qr">${qrSvg(label.link)}</div>` +
          `<div class="text"><div class="brand">${esc(texts.brand)}</div><div class="code">${esc(label.code)}</div>` +
          `<div class="kind">${esc(label.kindLine)}</div><div class="name">${esc(label.name)}</div></div>` +
          `<div class="finder">${esc(texts.finder)}</div></div>`,
      );
    }
    if (options.calibration && sheet === 0) {
      parts.push(
        `<div class="ms-cal"><b>${esc(texts.calibrationTitle)}</b><br>${esc(texts.calibrationHelp)}` +
          `<div class="ms-ruler"></div>${esc(texts.ruler)}</div>`,
      );
    }
    pages.push(`<div class="ms-sheet">${parts.join('')}</div>`);
  }
  return pages.join('');
}
