// Reads the first sheet of an Excel file (.xlsx) or a CSV file into rows of text, for the student
// import (screen G3, src/data/student-import.ts). Plain JavaScript, so it works the same on the
// web and on phones and needs no new APK (docs/DECISIONS.md #46).
//
// An .xlsx file is a zip of XML files. fflate (a small, MIT-licensed, pure-JavaScript unzip)
// opens the zip; the few XML files the import needs are read here with patterns, which is enough
// for the plain cell values of a list: shared text, inline text, numbers, true/false. Formulas
// give their last saved value. Dates come as Excel's day numbers; the import turns them into
// dates for the columns that hold dates. Old .xls files (before 2007) are not read: "Save as"
// .xlsx or CSV first.

import { strFromU8, unzipSync } from 'fflate';

/** A sheet as rows of cell text; empty cells are ''. Trailing empty rows are dropped. */
export type SheetRows = string[][];

/** Why a file could not be read. */
export type SheetError = 'not_a_sheet' | 'old_excel' | 'empty' | 'too_big';

/** Files larger than this are refused before reading (a list of a few hundred students is far smaller). */
export const MAX_SHEET_BYTES = 5 * 1024 * 1024;
/** At most this many rows are read; the database imports 500 at a time anyway. */
const MAX_ROWS = 2000;
/** An XML part inside the zip larger than this is not opened (protects against zip bombs). */
const MAX_PART_BYTES = 40 * 1024 * 1024;

/** Reads a picked file by its name (.xlsx, .csv or .txt) and contents. */
export function readSheet(fileName: string, bytes: Uint8Array): SheetRows | SheetError {
  if (bytes.length > MAX_SHEET_BYTES) return 'too_big';
  const name = fileName.toLowerCase();
  // A zip starts with "PK"; an old binary .xls with D0 CF 11 E0.
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOldExcel = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  let rows: SheetRows | null;
  if (isOldExcel || name.endsWith('.xls')) return 'old_excel';
  if (isZip || name.endsWith('.xlsx')) rows = readXlsx(bytes);
  else rows = readCsv(decodeText(bytes));
  if (rows === null) return 'not_a_sheet';
  const trimmed = dropEmptyTail(rows).slice(0, MAX_ROWS);
  return trimmed.length === 0 ? 'empty' : trimmed;
}

// ---------------------------------------------------------------- CSV

/** UTF-8 text without the byte-order mark Excel puts at the start of a "CSV UTF-8" file. */
function decodeText(bytes: Uint8Array): string {
  return strFromU8(bytes).replace(/^﻿/, '');
}

/**
 * Reads CSV text: fields separated by commas, semicolons or tabs (whichever the first line uses
 * most), "quoted" fields may hold separators, line breaks and "" for a quote.
 */
export function readCsv(text: string): SheetRows {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const separator = [',', ';', '\t'].reduce(
    (best, candidate) => (firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best),
    ',',
  );
  const rows: SheetRows = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === separator) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
      if (rows.length > MAX_ROWS) break;
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------- XLSX

/** Reads the first sheet of an .xlsx file, or null when the zip is not a workbook. */
function readXlsx(bytes: Uint8Array): SheetRows | null {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) =>
        file.originalSize <= MAX_PART_BYTES &&
        (file.name === 'xl/workbook.xml' ||
          file.name === 'xl/_rels/workbook.xml.rels' ||
          file.name === 'xl/sharedStrings.xml' ||
          file.name.startsWith('xl/worksheets/sheet')),
    });
  } catch {
    return null;
  }
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : null);
  const sheetPath = firstSheetPath(text('xl/workbook.xml'), text('xl/_rels/workbook.xml.rels'));
  const sheet = text(sheetPath) ?? text('xl/worksheets/sheet1.xml');
  if (sheet === null) return null;
  return readSheetXml(sheet, readSharedStrings(text('xl/sharedStrings.xml') ?? ''));
}

/** The zip path of the workbook's first sheet (the first tab), from workbook.xml and its links. */
function firstSheetPath(workbook: string | null, rels: string | null): string {
  const fallback = 'xl/worksheets/sheet1.xml';
  if (!workbook || !rels) return fallback;
  const sheetTag = /<(?:\w+:)?sheet\b[^>]*>/.exec(workbook)?.[0];
  const relId = sheetTag ? /\br:id="([^"]+)"/.exec(sheetTag)?.[1] : undefined;
  if (!relId) return fallback;
  for (const tag of rels.match(/<Relationship\b[^>]*>/g) ?? []) {
    if (attribute(tag, 'Id') !== relId) continue;
    const target = attribute(tag, 'Target');
    if (!target) return fallback;
    // Targets are relative to xl/ ("worksheets/sheet1.xml") or absolute ("/xl/worksheets/...").
    return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  return fallback;
}

/** The workbook's shared text list: cells of type "s" hold an index into it. */
function readSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  for (const item of xml.match(/<si\b[^>]*>[\s\S]*?<\/si>|<si\b[^>]*\/>/g) ?? []) {
    // Pronunciation guides (<rPh>) are not part of the text.
    const visible = item.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    strings.push(textRuns(visible));
  }
  return strings;
}

/** The text of every <t> run inside an XML piece, joined. */
function textRuns(xml: string): string {
  let result = '';
  for (const run of xml.match(/<t\b[^>]*>[\s\S]*?<\/t>/g) ?? []) {
    result += unescapeXml(run.replace(/^<t\b[^>]*>/, '').replace(/<\/t>$/, ''));
  }
  return result;
}

/** Reads the cells of a worksheet into rows, placing each cell by its reference (B3 = row 3, column 2). */
function readSheetXml(xml: string, shared: string[]): SheetRows {
  const rows: SheetRows = [];
  const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let nextRow = 0;
  for (const rowXml of xml.match(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g) ?? []) {
    const rowNumber = Number(attribute(rowXml.slice(0, rowXml.indexOf('>') + 1), 'r')) || nextRow + 1;
    const rowIndex = rowNumber - 1;
    nextRow = rowNumber;
    if (rowIndex >= MAX_ROWS) break;
    const cells: string[] = [];
    let nextColumn = 0;
    for (const match of rowXml.matchAll(cellPattern)) {
      const attrs = match[1];
      const inner = match[2] ?? '';
      const ref = attribute(attrs, 'r');
      const column = ref ? columnIndex(ref) : nextColumn;
      nextColumn = column + 1;
      cells[column] = cellValue(attribute(attrs, 't'), inner, shared);
    }
    rows[rowIndex] = Array.from(cells, (value) => value ?? '');
  }
  return Array.from(rows, (row) => row ?? []);
}

/** The text of one cell by its type: shared text, inline text, formula text, true/false, number. */
function cellValue(type: string | null, inner: string, shared: string[]): string {
  if (type === 'inlineStr') return textRuns(inner).trim();
  const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
  if (raw === undefined) return '';
  const value = unescapeXml(raw);
  if (type === 's') return (shared[Number(value)] ?? '').trim();
  if (type === 'b') return value === '1' ? 'TRUE' : 'FALSE';
  if (type === 'e') return '';
  return value.trim();
}

/** Zero-based column of a cell reference: A1 → 0, B7 → 1, AA3 → 26. */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref.toUpperCase())?.[0] ?? 'A';
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/** The value of one XML attribute in a tag, or null. */
function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return match ? unescapeXml(match[1]) : null;
}

/** Turns &amp;, &lt;, &#233; and the like back into characters. */
function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, code: string) => {
    switch (code) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
    }
    const point = code.startsWith('#x') ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : '';
  });
}

/** Drops empty rows at the end (Excel often keeps formatted but empty rows). */
function dropEmptyTail(rows: SheetRows): SheetRows {
  let end = rows.length;
  while (end > 0 && rows[end - 1].every((cell) => cell.trim() === '')) end--;
  return rows.slice(0, end);
}
