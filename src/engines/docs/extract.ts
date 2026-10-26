// Local document text extraction: PDF (pdf.js), DOCX, XLSX, CSV, TXT, Markdown.
// Runs entirely in the browser; nothing is uploaded anywhere.
import JSZip from 'jszip';
import { readXlsx } from '../workbook/xlsx';

export type DocKind = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'txt' | 'md' | 'unknown';

export interface ExtractedPage {
  page?: number;
  section?: string;
  text: string;
}

export interface Extracted {
  kind: DocKind;
  pages: ExtractedPage[];
  pageCount: number;
  warnings: string[];
}

export function kindOf(name: string, mime = ''): DocKind {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx';
  if (ext === 'csv') return 'csv';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'txt' || mime.startsWith('text/')) return 'txt';
  return 'unknown';
}

// pdf.js is injected so the same code runs in the browser (main build) and in Node tests (legacy build).
export interface PdfLib {
  getDocument: (src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string; hasEOL?: boolean }[] }> }> }> };
}

export async function extractPdf(data: Uint8Array, pdfjs: PdfLib): Promise<Extracted> {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pages: ExtractedPage[] = [];
  const warnings: string[] = [];
  let empty = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const tc = await p.getTextContent();
    const text = tc.items.map((it) => (it.str ?? '') + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').trim();
    if (!text) empty++;
    pages.push({ page: i, text });
  }
  if (empty === doc.numPages) warnings.push('No text layer found — this PDF appears to be scanned images. It can be viewed but not searched (no OCR is bundled).');
  else if (empty) warnings.push(`${empty} page(s) have no text layer.`);
  return { kind: 'pdf', pages, pageCount: doc.numPages, warnings };
}

export async function extractDocx(data: ArrayBuffer | Uint8Array): Promise<Extracted> {
  const zip = await JSZip.loadAsync(data);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('Not a .docx file (word/document.xml missing)');
  const paras = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((m) =>
    [...m[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
      .map((t) => (t[1] !== undefined ? t[1] : t[0].startsWith('<w:tab') ? '\t' : '\n'))
      .join('')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&'),
  );
  // Section detection by headings (paragraph style Heading)
  const text = paras.join('\n');
  return { kind: 'docx', pages: [{ text }], pageCount: 1, warnings: [] };
}

export async function extractXlsx(data: ArrayBuffer | Uint8Array): Promise<Extracted> {
  const wb = await readXlsx(data);
  const pages: ExtractedPage[] = wb.sheets.map((s) => {
    const rows: string[] = [];
    for (let r = 1; r <= s.maxRow; r++) {
      const vals: string[] = [];
      for (let c = 1; c <= s.maxCol; c++) {
        const cell = s.cells.get(`${colName(c)}${r}`);
        if (cell && cell.cached !== null && cell.cached !== undefined && cell.cached !== '') vals.push(String(cell.cached));
      }
      if (vals.length) rows.push(vals.join(' | '));
    }
    return { section: s.name, text: rows.join('\n') };
  });
  return { kind: 'xlsx', pages, pageCount: pages.length, warnings: [] };
}

function colName(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function extractText(text: string, kind: DocKind): Extracted {
  // Split very long text files into ~8,000-character "pages" so citations stay specific.
  const pages: ExtractedPage[] = [];
  const size = 8000;
  if (text.length <= size) pages.push({ page: 1, text });
  else for (let i = 0, p = 1; i < text.length; i += size, p++) pages.push({ page: p, text: text.slice(i, i + size) });
  return { kind, pages, pageCount: pages.length, warnings: [] };
}

export async function extractAny(name: string, mime: string, data: ArrayBuffer, pdfjs?: PdfLib): Promise<Extracted> {
  const k = kindOf(name, mime);
  switch (k) {
    case 'pdf':
      if (!pdfjs) throw new Error('PDF engine not loaded');
      return extractPdf(new Uint8Array(data), pdfjs);
    case 'docx':
      return extractDocx(data);
    case 'xlsx':
      return extractXlsx(data);
    case 'csv':
    case 'txt':
    case 'md':
      return extractText(new TextDecoder('utf-8').decode(data), k);
    default:
      throw new Error(`Unsupported file type: ${name}. Accepted: PDF, XLSX, CSV, DOCX, TXT, Markdown.`);
  }
}
