import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

/**
 * People read from an uploaded spreadsheet (guest list, mailing list), however it is laid out:
 * a title or blank lines above the table, a cover sheet first, headers in French or English
 * worded in many ways ("Adresse électronique", "E-mail Address", "Tél. portable"…), addresses
 * in "Name <address>" cells or behind mailto links. The e-mail column is the one holding the
 * most addresses, so a header the platform does not know never blocks an import again.
 */

export interface SheetPerson {
  /** The address found in the e-mail cell, or what the cell holds when it is not one */
  email: string;
  /** Full name: "Prénom Nom" when the file splits them */
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** Line in the file, for error reports */
  row: number;
}

const EMAIL_IN = /[^\s<>"';,:]+@[^\s<>"';,:]+\.[^\s<>"';,:]+/;
/** The address inside a cell ("Marie <marie@x.com>", "mailto:…", spaces around it) */
export const emailIn = (v: string) => EMAIL_IN.exec(v)?.[0] ?? null;

/** What a cell shows, or the address behind a mailto link */
const cellText = (cell: ExcelJS.Cell) => {
  const v = cell.value as any;
  if (v && typeof v === 'object' && typeof v.hyperlink === 'string' && /^mailto:/i.test(v.hyperlink)) return v.hyperlink.slice(7);
  return String(cell.text ?? '').trim();
};

const normalize = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[*:._() '’°-]/g, ' ').trim().replace(/\s+/g, ' ');

// Header words, matched inside the title; checked in this order ("Nom et prénom" is a full name)
const HEADERS = [
  ['name', /\b(nom et prenom|prenom et nom|nom prenom|prenom nom|nom complet|full ?name)\b/],
  ['firstName', /\b(prenom|first ?name|given name)\b/],
  ['lastName', /\b(nom de famille|last ?name|surname|family name)\b/],
  ['email', /\b(e ?mail|courriel|mail|adresse electronique|email address)\b/],
  ['phone', /\b(tel|telephone|phone|mobile|portable|gsm|numero|n de telephone|whatsapp|cell)\b/],
  ['name', /\b(noms?|names?|participants?|contact|invites?|clients?|personnes?|beneficiaires?)\b/],
] as const;
type Column = 'name' | 'firstName' | 'lastName' | 'email' | 'phone';

function headerColumns(row: ExcelJS.Row, skip?: number) {
  const cols: Partial<Record<Column, number>> = {};
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    if (col === skip) return;
    const t = normalize(cellText(cell));
    if (!t) return;
    for (const [key, re] of HEADERS) {
      if (cols[key] === undefined && re.test(t)) { cols[key] = col; break; }
    }
  });
  return cols;
}

/**
 * Reads the people of a workbook. Without any address in it, a list is still read when
 * `requireEmail` is false (paper invitations): the table then starts under the first row that
 * looks like a header with a name column.
 */
export function readPeople(wb: ExcelJS.Workbook, requireEmail: boolean): SheetPerson[] {
  // 1. The e-mail column, by content, on whichever sheet
  let best: { ws: ExcelJS.Worksheet; col: number; count: number; firstRow: number } | null = null;
  for (const ws of wb.worksheets) {
    const counts = new Map<number, { count: number; firstRow: number }>();
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n > 500) return;
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        if (!emailIn(cellText(cell))) return;
        const c = counts.get(col) ?? { count: 0, firstRow: n };
        c.count++;
        counts.set(col, c);
      });
    });
    counts.forEach((c, col) => { if (!best || c.count > best.count) best = { ws, col, ...c }; });
  }

  let ws: ExcelJS.Worksheet;
  let firstRow: number;
  let cols: Partial<Record<Column, number>> = {};
  if (best) {
    const found = best as { ws: ExcelJS.Worksheet; col: number; firstRow: number };
    ws = found.ws;
    firstRow = found.firstRow;
    // 2. Its header: the nearest non-empty row above the first address, if any
    for (let h = firstRow - 1; h >= Math.max(1, firstRow - 5); h--) {
      const row = ws.getRow(h);
      if (!row.cellCount || !row.values || !(row.values as any[]).some((v) => v !== null && v !== undefined && String(v).trim())) continue;
      cols = headerColumns(row, found.col);
      break;
    }
    cols.email = found.col;
  } else {
    if (requireEmail) throw new BadRequestException('Aucune adresse e-mail trouvée dans le fichier');
    // No address at all: the first row naming a "Nom" column starts the table
    let header: { ws: ExcelJS.Worksheet; n: number; cols: Partial<Record<Column, number>> } | null = null;
    for (const sheet of wb.worksheets) {
      for (let n = 1; n <= Math.min(10, sheet.rowCount) && !header; n++) {
        const c = headerColumns(sheet.getRow(n));
        if (c.name !== undefined || c.firstName !== undefined || c.lastName !== undefined) header = { ws: sheet, n, cols: c };
      }
      if (header) break;
    }
    if (!header) throw new BadRequestException('Colonne "Nom" introuvable : ajoutez une ligne de titres avec une colonne « Nom »');
    ({ ws, cols } = header);
    firstRow = header.n + 1;
  }

  // 3. No name header found: the first text column left of (or next to) the addresses
  if (cols.name === undefined && cols.firstName === undefined && cols.lastName === undefined) {
    const sample = ws.getRow(firstRow);
    sample.eachCell({ includeEmpty: false }, (cell, col) => {
      const t = cellText(cell);
      if (cols.name === undefined && col !== cols.email && col !== cols.phone && t && !emailIn(t) && !/^\+?[\d\s().-]{6,}$/.test(t)) cols.name = col;
    });
  }

  const people: SheetPerson[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n < firstRow) return;
    const t = (c?: number) => (c ? cellText(row.getCell(c)) : '');
    const raw = t(cols.email);
    const first = t(cols.firstName);
    const last = t(cols.lastName) || (cols.firstName !== undefined ? t(cols.name) : '');
    const name = cols.firstName !== undefined || cols.lastName !== undefined ? [first, last].filter(Boolean).join(' ') : t(cols.name);
    if (!name && !raw) return; // blank line
    people.push({ email: emailIn(raw) ?? raw, name, firstName: first, lastName: last, phone: t(cols.phone), row: n });
  });
  return people;
}
