// The browser version of ./save-csv.ts: the CSV file is downloaded like any file from a website
// (on a laptop into Downloads; on an iPhone Safari offers to keep it in Files).

/** The ways this platform offers. */
export const CSV_WAYS: readonly ('download' | 'folder' | 'share')[] = ['download'];

/** What happened. */
export type CsvResult = 'saved' | 'cancelled' | 'failed';

/** Downloads `text` as `fileName`. */
export async function downloadCsv(fileName: string, text: string): Promise<CsvResult> {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
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

/** Not offered in the browser (not in CSV_WAYS); downloads instead. */
export async function saveCsvToFolder(fileName: string, text: string): Promise<CsvResult> {
  return downloadCsv(fileName, text);
}

/** Not offered in the browser (not in CSV_WAYS); downloads instead. */
export async function shareCsv(fileName: string, text: string): Promise<CsvResult> {
  return downloadCsv(fileName, text);
}
