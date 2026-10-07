// The label sheet in the browser (docs/DECISIONS.md #158): a scaled preview of the first sheet on
// the page, and the full-size sheets in #ms-label-print, a direct child of <body> that only the
// printer sees (SHEET_CSS hides everything else when printing). The HTML comes from
// src/lib/label-sheet.ts; it holds no scripts.

import { createElement, useEffect } from 'react';

import { SHEET, SHEET_CSS } from '@/lib/label-sheet';

/** Props for LabelPrint. */
export type LabelPrintProps = {
  /** sheetHtml(...) of every sheet. */
  html: string;
  /** Width available for the preview, in pixels. */
  previewWidth: number;
  /** What a screen reader says for the preview, already translated. */
  label: string;
};

/** 1 mm in CSS pixels. */
const PX_PER_MM = 96 / 25.4;

/** The id of the print copy under <body>. */
const PRINT_ID = 'ms-label-print';

/** The preview (first sheet, scaled to fit) and the hidden print copy. */
export function LabelPrint({ html, previewWidth, label }: LabelPrintProps) {
  // The print copy lives directly under <body>, outside the app's own layout, so the print CSS can
  // hide the app with one rule. It is replaced when the sheets change and removed with the screen.
  useEffect(() => {
    const node = document.createElement('div');
    node.id = PRINT_ID;
    node.innerHTML = html;
    document.getElementById(PRINT_ID)?.remove();
    document.body.appendChild(node);
    return () => node.remove();
  }, [html]);

  const pageWidth = SHEET.pageWidth * PX_PER_MM;
  const scale = Math.min(1, Math.max(previewWidth, 1) / pageWidth);
  return createElement(
    'div',
    null,
    createElement('style', null, SHEET_CSS),
    createElement(
      'div',
      {
        role: 'img',
        'aria-label': label,
        style: {
          width: pageWidth * scale,
          height: SHEET.pageHeight * PX_PER_MM * scale,
          overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        },
      },
      createElement('div', {
        style: { transform: `scale(${scale})`, transformOrigin: 'top left', width: pageWidth },
        dangerouslySetInnerHTML: { __html: html.slice(0, firstSheetEnd(html)) },
      }),
    ),
  );
}

/** Where the first sheet's HTML ends (the sheets are siblings: <div class="ms-sheet">...</div>). */
function firstSheetEnd(html: string): number {
  const next = html.indexOf('<div class="ms-sheet">', 1);
  return next === -1 ? html.length : next;
}

/** Opens the browser's print dialog. */
export function printLabels(): void {
  window.print();
}
