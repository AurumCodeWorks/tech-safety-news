import Papa from 'papaparse';

export type ContactRow = { email: string; name: string };
export type ColumnMapping = { email: string; name?: string; first?: string; last?: string };
export type ParseResult = {
  rows: ContactRow[];
  invalid: { line: number; value: string }[];
  duplicatesInFile: number;
  columns: string[];
  mapping: ColumnMapping | null;
};

const EMAIL_COLS = ['email', 'email address', 'e-mail', 'primarysmtpaddress', 'mail'];
const NAME_COLS = ['display name', 'displayname', 'name', 'full name'];
const FIRST_COLS = ['first name', 'firstname', 'given name'];
const LAST_COLS = ['last name', 'lastname', 'surname'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BOM = /^﻿/;
const DELIMITERS = [',', ';', '\t'];

function find(columns: string[], aliases: string[]): string | undefined {
  return columns.find((c) => aliases.includes(c.trim().toLowerCase()));
}

export function detectMapping(columns: string[]): ColumnMapping | null {
  const email = find(columns, EMAIL_COLS);
  if (!email) return null;
  const name = find(columns, NAME_COLS);
  if (name) return { email, name };
  const first = find(columns, FIRST_COLS);
  const last = find(columns, LAST_COLS);
  return { email, ...(first ? { first } : {}), ...(last ? { last } : {}) };
}

/** Excel and O365 exports use commas, semicolons (some locales) or tabs; the header line decides. */
function guessDelimiter(text: string): string {
  const header = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = DELIMITERS.map((d) => ({ d, n: header.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ',';
}

export function parseContactsCsv(text: string, explicit?: ColumnMapping): ParseResult {
  const clean = text.replace(BOM, '');
  const parsed = Papa.parse<string[]>(clean, { skipEmptyLines: false, delimiter: guessDelimiter(clean) });
  const all = parsed.data;
  const columns = (all[0] ?? []).map((c) => c.trim());
  const mapping = explicit ?? detectMapping(columns);
  const result: ParseResult = { rows: [], invalid: [], duplicatesInFile: 0, columns, mapping };
  if (!mapping) return result;

  const idx = (col?: string) => (col ? columns.indexOf(col) : -1);
  const iEmail = idx(mapping.email);
  const iName = idx(mapping.name);
  const iFirst = idx(mapping.first);
  const iLast = idx(mapping.last);
  if (iEmail < 0) return { ...result, mapping: null };

  const seen = new Set<string>();
  all.slice(1).forEach((cells, i) => {
    if (cells.every((c) => c.trim() === '')) return;
    const line = i + 2;
    const raw = (cells[iEmail] ?? '').trim();
    const email = raw.toLowerCase();
    if (!EMAIL_RE.test(email)) {
      result.invalid.push({ line, value: raw });
      return;
    }
    if (seen.has(email)) {
      result.duplicatesInFile++;
      return;
    }
    seen.add(email);
    const name =
      iName >= 0
        ? (cells[iName] ?? '').trim()
        : [iFirst, iLast].filter((x) => x >= 0).map((x) => (cells[x] ?? '').trim()).filter(Boolean).join(' ');
    result.rows.push({ email, name });
  });
  return result;
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: ContactRow[]): string {
  return `Email,Name\n${rows.map((r) => `${csvCell(r.email)},${csvCell(r.name)}`).join('\n')}${rows.length ? '\n' : ''}`;
}
