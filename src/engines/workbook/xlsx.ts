// Minimal XLSX reader/writer built on JSZip. Reads values, cached results and
// formulas (expanding shared formulas); writes value-only workbooks for exports.
import JSZip from 'jszip';
import { a1, colToNum, parseA1, shiftFormula, type CellValue, XlError } from './formula';

export interface RawCell {
  r: number;
  c: number;
  formula?: string;
  cached: CellValue;
  type: 'n' | 's' | 'b' | 'e' | 'str' | 'inlineStr' | 'empty';
}

export interface RawSheet {
  name: string;
  cells: Map<string, RawCell>;
  maxRow: number;
  maxCol: number;
}

export interface RawWorkbook {
  sheets: RawSheet[];
  sheetOrder: string[];
}

function decode(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, '&');
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) out[m[1]] = decode(m[2]);
  return out;
}

export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<RawWorkbook> {
  const zip = await JSZip.loadAsync(data);
  const wbXml = await zip.file('xl/workbook.xml')?.async('string');
  if (!wbXml) throw new Error('Not an .xlsx workbook (xl/workbook.xml missing)');
  const relsXml = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? '';
  const rels: Record<string, string> = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attrs(m[0]);
    rels[a.Id] = a.Target;
  }
  const ssXml = (await zip.file('xl/sharedStrings.xml')?.async('string')) ?? '';
  const shared: string[] = [];
  for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const parts = [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decode(x[1]));
    shared.push(parts.join(''));
  }
  const sheets: RawSheet[] = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const a = attrs(m[0]);
    const rid = a['r:id'] ?? a.id;
    let target = rels[rid] ?? '';
    target = target.replace(/^\/?xl\//, '');
    const xml = await zip.file(`xl/${target}`)?.async('string');
    if (!xml) continue;
    sheets.push(parseSheet(a.name, xml, shared));
  }
  return { sheets, sheetOrder: sheets.map((s) => s.name) };
}

function parseSheet(name: string, xml: string, shared: string[]): RawSheet {
  const cells = new Map<string, RawCell>();
  const sharedMasters: Record<string, { formula: string; r: number; c: number }> = {};
  let maxRow = 0;
  let maxCol = 0;
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (const m of xml.matchAll(cellRe)) {
    const a = attrs(m[1]);
    if (!a.r) continue;
    const { r, c } = parseA1(a.r);
    maxRow = Math.max(maxRow, r);
    maxCol = Math.max(maxCol, c);
    const inner = m[2] ?? '';
    const t = (a.t ?? 'n') as RawCell['type'];
    const fm = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(inner);
    const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
    const isM = /<is>([\s\S]*?)<\/is>/.exec(inner);
    let cached: CellValue = null;
    if (t === 's' && vm) cached = shared[Number(vm[1])] ?? '';
    else if (t === 'b' && vm) cached = vm[1] === '1';
    else if (t === 'e' && vm) cached = new XlError(decode(vm[1]));
    else if ((t === 'str' || t === 'inlineStr') && (vm || isM)) cached = vm ? decode(vm[1]) : [...(isM?.[1] ?? '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decode(x[1])).join('');
    else if (vm) cached = Number(vm[1]);
    let formula: string | undefined;
    if (fm) {
      const fa = attrs(fm[1]);
      const text = fm[2] ? decode(fm[2]) : '';
      if (fa.t === 'shared') {
        if (text) {
          sharedMasters[fa.si] = { formula: text, r, c };
          formula = text;
        } else if (sharedMasters[fa.si]) {
          const ms = sharedMasters[fa.si];
          formula = shiftFormula(ms.formula, r - ms.r, c - ms.c);
        }
      } else if (fa.t === 'array') {
        formula = text;
      } else formula = text;
      if (formula !== undefined) formula = '=' + formula;
    }
    cells.set(a.r.replace(/\$/g, ''), { r, c, formula, cached, type: vm || fm || isM ? t : 'empty' });
  }
  return { name, cells, maxRow, maxCol };
}

// ---------- Writer (values only) ----------
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function writeXlsx(sheets: { name: string; rows: (string | number | null)[][] }[]): Promise<Blob> {
  const zip = new JSZip();
  const safe = sheets.map((s, i) => ({ ...s, name: s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Sheet${i + 1}` }));
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${safe.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${safe.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safe.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`);
  safe.forEach((s, i) => {
    const rows = s.rows
      .map((row, ri) => `<row r="${ri + 1}">${row.map((v, ci) => (v === null || v === undefined || v === '' ? '' : typeof v === 'number' && Number.isFinite(v) ? `<c r="${a1(ri + 1, ci + 1)}"><v>${v}</v></c>` : `<c r="${a1(ri + 1, ci + 1)}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`)).join('')}</row>`)
      .join('');
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`);
  });
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export { colToNum };
