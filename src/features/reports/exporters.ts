import { writeXlsx } from '../../engines/workbook/xlsx';

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

export interface ReportSection {
  title: string;
  header: string[];
  rows: (string | number)[][];
  note?: string;
}

export interface Report {
  id: string;
  title: string;
  summary: string[];
  assumptions: string[];
  evidence: string[];
  sections: ReportSection[];
  generatedAt: string;
  scenarioName: string;
  currency: string;
}

export function reportToCsv(r: Report): string {
  const rows: unknown[][] = [[r.title], [`Scenario: ${r.scenarioName}`], [`Generated: ${r.generatedAt}`], [`Currency: ${r.currency}`], [], ['Executive summary'], ...r.summary.map((s) => [s]), [], ['Key assumptions'], ...r.assumptions.map((s) => [s]), [], ['Evidence status'], ...r.evidence.map((s) => [s])];
  for (const s of r.sections) rows.push([], [s.title], s.header, ...s.rows, ...(s.note ? [[s.note]] : []));
  return toCsv(rows);
}

export async function reportToXlsx(r: Report): Promise<Blob> {
  const cover = { name: 'Summary', rows: [[r.title], [`Scenario: ${r.scenarioName}`], [`Generated: ${r.generatedAt}`], [`Currency: ${r.currency}`], [null], ['Executive summary'], ...r.summary.map((s) => [s]), [null], ['Key assumptions'], ...r.assumptions.map((s) => [s]), [null], ['Evidence status'], ...r.evidence.map((s) => [s])] as (string | number | null)[][] };
  const sheets = r.sections.map((s) => ({ name: s.title.slice(0, 31), rows: [s.header, ...s.rows, ...(s.note ? [[s.note]] : [])] as (string | number | null)[][] }));
  return writeXlsx([cover, ...sheets]);
}
