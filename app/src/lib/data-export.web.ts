// The browser version of ./data-export.ts: the JSON file downloads like any file from a website, and the summary
// prints as a page of its own (src/lib/my-data-page.ts) through the browser's print dialog, where "Save as PDF"
// keeps a copy. The print copy is a direct child of <body> that only the printer sees, as the label sheets are
// (src/components/label-print.web.tsx); it goes again after printing.

import { PRINT_ID } from './my-data-page';

/** What happened. */
export type ExportResult = 'saved' | 'cancelled' | 'failed';

/** Whether this platform prints the summary page. */
export const CAN_PRINT = true;

/** Downloads `text` as `fileName`. */
export async function saveJsonFile(fileName: string, text: string, _dialogTitle: string): Promise<ExportResult> {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the browser a moment to start the download before the link is let go.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'saved';
  } catch {
    return 'failed';
  }
}

/** Puts the page (already escaped HTML) under <body> with its print CSS and opens the print dialog. */
export function printPage(html: string, css: string): void {
  document.getElementById(PRINT_ID)?.remove();
  document.getElementById(`${PRINT_ID}-css`)?.remove();
  const style = document.createElement('style');
  style.id = `${PRINT_ID}-css`;
  style.textContent = css;
  document.head.appendChild(style);
  const node = document.createElement('div');
  node.id = PRINT_ID;
  node.innerHTML = html;
  document.body.appendChild(node);
  const cleanUp = () => {
    node.remove();
    style.remove();
    window.removeEventListener('afterprint', cleanUp);
  };
  window.addEventListener('afterprint', cleanUp);
  window.print();
}
