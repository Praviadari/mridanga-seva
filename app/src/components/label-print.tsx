// The label sheet on a phone (1.1.0 APK, docs/DECISIONS.md #801): expo-print hands the same sheets the browser prints
// (src/lib/label-sheet.ts, qr-card-sheet.ts) to Android's print window, which shows them first and offers a printer
// or "Save as PDF". No preview on the screen itself (the print window is the preview); label-print.web.tsx keeps the
// browser's preview and print dialog (#158).

import * as Print from 'expo-print';

import { SHEET_CSS } from '@/lib/label-sheet';

/** Props for LabelPrint. */
export type LabelPrintProps = { html: string; previewWidth: number; label: string; css?: string };

/** Nothing on a phone: the print window shows the sheets. */
export function LabelPrint(_props: LabelPrintProps) {
  return null;
}

/** A4 in PostScript points (72 a inch), the page size expo-print takes. */
const A4_POINTS = { width: 595, height: 842 };

/**
 * Opens the phone's print window with the sheets (`html`, sheetHtml(...) of every sheet) and their `css` (the asset
 * labels' SHEET_CSS when left out). The print CSS shows only #ms-label-print, so the sheets go inside it, shown on
 * screen too (the print window draws the page as a screen). Resolves once the window is open; a closed window is
 * no error.
 */
export async function printLabels(html: string, css: string = SHEET_CSS): Promise<void> {
  const page =
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<style>${css}\n#ms-label-print{display:block!important}html,body{margin:0;padding:0}</style>` +
    `</head><body><div id="ms-label-print">${html}</div></body></html>`;
  try {
    await Print.printAsync({ html: page, ...A4_POINTS });
  } catch {
    // No print service on the phone: nothing opens, the screen stays as it was.
  }
}
