// The label sheet exists only in the browser (label-print.web.tsx): phones have no print module
// in this build (no expo-print), so the labels screen sends them to the web page instead
// (docs/DECISIONS.md #158). This file keeps the same names for the phone build.

/** Props for LabelPrint. */
export type LabelPrintProps = { html: string; previewWidth: number; label: string; css?: string };

/** Nothing on a phone. */
export function LabelPrint(_props: LabelPrintProps) {
  return null;
}

/** Nothing on a phone. */
export function printLabels(): void {}
