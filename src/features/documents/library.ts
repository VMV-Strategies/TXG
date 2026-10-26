// Local document library: import → extract → chunk → store in IndexedDB → index.
import { chunkText, SearchIndex, type Chunk } from '../../engines/docs/search';
import { extractAny, kindOf, type PdfLib } from '../../engines/docs/extract';
import { PROVISIONS, provisionHierarchy } from '../../data/sources';
import * as db from '../../storage/db';
import { getState, setState, type DocMeta } from '../../state/store';

let index: SearchIndex | null = null;
let building: Promise<SearchIndex> | null = null;

export function provisionChunks(): Chunk[] {
  return PROVISIONS.map((p) => ({ id: `prov:${p.id}`, docId: `prov:${p.id}`, docTitle: `${p.citation} — ${p.title}`, hierarchy: provisionHierarchy(p), section: p.authority, citation: p.citation, text: p.text }));
}

export async function ensureIndex(): Promise<SearchIndex> {
  if (index) return index;
  if (building) return building;
  building = (async () => {
    const idx = new SearchIndex();
    idx.add(provisionChunks());
    try {
      const chunks = await db.getAll<Chunk>('chunks');
      idx.add(chunks);
    } catch {
      /* no storage — legislation only */
    }
    index = idx;
    return idx;
  })();
  return building;
}

let pdfLib: PdfLib | null = null;
async function loadPdf(): Promise<PdfLib> {
  if (pdfLib) return pdfLib;
  const mod = (await import('pdfjs-dist')) as unknown as PdfLib & { GlobalWorkerOptions: { workerSrc: string } };
  mod.GlobalWorkerOptions.workerSrc = new URL('assets/pdf.worker.min.mjs', document.baseURI).toString();
  pdfLib = mod;
  return mod;
}

export interface ImportResult {
  meta: DocMeta;
  warnings: string[];
}

export async function importFile(file: File, opts: { hierarchy?: string; confidential?: boolean } = {}): Promise<ImportResult> {
  const kind = kindOf(file.name, file.type);
  if (kind === 'unknown') throw new Error(`${file.name}: unsupported type. Accepted: PDF, XLSX, CSV, DOCX, TXT, Markdown.`);
  const buf = await file.arrayBuffer();
  const ex = await extractAny(file.name, file.type, buf, kind === 'pdf' ? await loadPdf() : undefined);
  const id = `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const hierarchy = opts.hierarchy ?? guessHierarchy(file.name);
  const meta: DocMeta = { id, name: file.name, title: file.name.replace(/^[0-9a-f]{8}-/, '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), kind, size: file.size, addedAt: new Date().toISOString(), pageCount: ex.pageCount, hierarchy, warnings: ex.warnings, confidential: opts.confidential ?? true, tags: [] };
  const chunks = chunkText(id, meta.title, hierarchy, ex.pages);
  await db.put('documents', meta);
  await db.put('blobs', new Blob([buf], { type: file.type || mimeFor(kind) }), id);
  await db.putMany('chunks', chunks);
  (await ensureIndex()).add(chunks);
  setState({ docs: [...getState().docs, meta] });
  return { meta, warnings: ex.warnings };
}

export async function removeDocument(id: string) {
  await db.del('documents', id);
  await db.del('blobs', id);
  await db.deleteChunksForDoc(id);
  (await ensureIndex()).removeDoc(id);
  setState({ docs: getState().docs.filter((d) => d.id !== id) });
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  return db.get<Blob>('blobs', id);
}

export async function docChunks(id: string): Promise<Chunk[]> {
  const all = await db.getAll<Chunk>('chunks');
  return all.filter((c) => c.docId === id).sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function mimeFor(kind: string) {
  return { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', md: 'text/markdown', txt: 'text/plain' }[kind] ?? 'application/octet-stream';
}

export function guessHierarchy(name: string): string {
  const n = name.toLowerCase();
  if (/usc|act|code|statute|_act|tax_convention|-c-\d|__/.test(n) && /\.txt$|\.html?$/.test(n)) return 'enacted-legislation';
  if (/cfr|regulation|sor-|c\.r\.c/.test(n)) return 'regulation';
  if (/fiba|book-6|regulations-book/.test(n)) return 'fiba-rule';
  if (/articles|certificate|isc|amendment|incorporation|registration|directors/.test(n)) return 'corporate-document';
  if (/model|\.xlsx$|budget|financial/.test(n)) return 'financial-template';
  if (/agreement|contract|term[- ]sheet/.test(n)) return 'binding-agreement';
  return 'user-assumption';
}
