// Builds the printable A4 sheet of students' QR cards (Phase 3 P3-1, docs/DECISIONS.md #249-#251)
// for src/app/staff/qr-cards.tsx, the same way as the asset labels (#158, src/lib/label-sheet.ts):
// plain HTML in millimetres, no scripts, printed by the browser at 100 %. Ten wallet cards a sheet
// (2 across, 5 down, bank-card size 85.6 x 54 mm) on plain paper or card, cut along the printed
// lines. The QR holds the same text as the student's My QR (MS1:<qr_token>, #17), so C5 reads it
// as it is.

import { esc, mm, PAGE_CSS, qrSvg, SHEET } from '@/lib/label-sheet';

/** The card layout, in mm. */
export const CARD = {
  columns: 2,
  rows: 5,
  width: 85.6,
  height: 54,
  /** Page edge to the first column's left edge: the cards are centred on the page. */
  left: (SHEET.pageWidth - 2 * 85.6) / 2,
  /** Page edge to the first row's top edge. */
  top: (SHEET.pageHeight - 5 * 54) / 2,
  /** The QR code's size with its quiet zone (the code itself is about 26 mm). */
  qr: 32,
} as const;

/** Cards on one sheet. */
export const CARDS_PER_SHEET = CARD.columns * CARD.rows;

/** One student's card, already translated. */
export type CardContent = {
  /** The code's text: studentQrText(qr_token) from src/data/attendance.ts, as on My QR. */
  qrText: string;
  fullName: string;
  rollNo: string;
  centreName: string;
};

/** Fixed lines of every card, already translated. */
export type CardTexts = { brand: string; cardTitle: string; logo: string; footer: string };

/** How many sheets `count` cards take. */
export function cardSheetsNeeded(count: number): number {
  return Math.ceil(count / CARDS_PER_SHEET);
}

/** Where card `index` (0-9) sits on the page, in mm from the top left corner. */
export function cardPosition(index: number): { x: number; y: number } {
  return { x: CARD.left + (index % CARD.columns) * CARD.width, y: CARD.top + Math.floor(index / CARD.columns) * CARD.height };
}

/** The CSS of the card sheet: the page box (shared with the labels), the cards and their cut lines. */
export const CARD_CSS = `${PAGE_CSS}
.ms-card{position:absolute;width:${CARD.width}mm;height:${CARD.height}mm;box-sizing:border-box;overflow:hidden;border:0.2mm dashed #999}
.ms-card .qr{position:absolute;left:1.5mm;top:${(CARD.height - CARD.qr) / 2 - 2}mm;width:${CARD.qr}mm;height:${CARD.qr}mm}
.ms-card .qr svg{display:block}
.ms-card .head{position:absolute;left:${CARD.qr + 2.5}mm;right:3mm;top:3.5mm;display:flex;align-items:center;gap:1.5mm}
.ms-card .logo{flex:none;width:8mm;height:8mm;border:0.3mm solid #000;border-radius:50%;display:flex;align-items:center;
  justify-content:center;font-size:4.5pt;text-align:center;line-height:1}
.ms-card .brand{font-size:8pt;font-weight:700;line-height:1.1}
.ms-card .title{font-size:6.5pt;line-height:1.1}
.ms-card .text{position:absolute;left:${CARD.qr + 2.5}mm;right:3mm;top:14mm;display:flex;flex-direction:column;gap:1.2mm}
.ms-card .name{font-size:10pt;font-weight:700;line-height:1.15;max-height:9.5mm;overflow:hidden}
.ms-card .roll{font-size:12pt;font-weight:700;line-height:1.1;word-break:break-all}
.ms-card .centre{font-size:7.5pt;line-height:1.2}
.ms-card .footer{position:absolute;left:3mm;right:3mm;bottom:2.5mm;font-size:6pt;line-height:1.2;text-align:center}
`;

/** The HTML of every sheet needed for `cards` (one empty sheet when there are none). */
export function cardSheetHtml(cards: CardContent[], texts: CardTexts): string {
  const sheets = Math.max(1, cardSheetsNeeded(cards.length));
  const pages: string[] = [];
  for (let sheet = 0; sheet < sheets; sheet++) {
    const parts: string[] = [];
    for (let slot = 0; slot < CARDS_PER_SHEET; slot++) {
      const card = cards[sheet * CARDS_PER_SHEET + slot];
      if (!card) break;
      const { x, y } = cardPosition(slot);
      parts.push(
        `<div class="ms-card" style="left:${mm(x)};top:${mm(y)}">` +
          `<div class="qr">${qrSvg(card.qrText, CARD.qr)}</div>` +
          `<div class="head"><div class="logo">${esc(texts.logo)}</div>` +
          `<div><div class="brand">${esc(texts.brand)}</div><div class="title">${esc(texts.cardTitle)}</div></div></div>` +
          `<div class="text"><div class="name">${esc(card.fullName)}</div><div class="roll">${esc(card.rollNo)}</div>` +
          `<div class="centre">${esc(card.centreName)}</div></div>` +
          `<div class="footer">${esc(texts.footer)}</div></div>`,
      );
    }
    pages.push(`<div class="ms-sheet">${parts.join('')}</div>`);
  }
  return pages.join('');
}
