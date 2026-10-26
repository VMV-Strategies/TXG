// Offline full-text search over bundled legislation excerpts and locally
// imported documents. BM25 ranking with light stemming and a small domain
// synonym table. No network, no external model.

export interface Chunk {
  id: string;
  docId: string;
  docTitle: string;
  hierarchy: string;
  page?: number;
  section?: string;
  citation?: string;
  text: string;
}

export interface SearchHit {
  chunk: Chunk;
  score: number;
  snippet: string;
  terms: string[];
}

const STOP = new Set('a an and are as at be by can could do does for from has have how i if in into is it its may of on or our shall should that the their there these this to was we what when where which who will with would you your'.split(' '));

const SYN: Record<string, string[]> = {
  us: ['united', 'states', 'american', 'u.s'],
  usa: ['united', 'states'],
  american: ['united', 'states'],
  canada: ['canadian'],
  canadian: ['canada'],
  company: ['corporation', 'corporations', 'entity'],
  corporation: ['company'],
  tax: ['taxed', 'taxation', 'taxes'],
  withholding: ['withhold', 'part', 'xiii', 'non-resident', 'nonresident'],
  'non-resident': ['nonresident'],
  interest: ['interest', 'debt-claims'],
  dividend: ['dividends'],
  royalty: ['royalties', 'licence', 'license'],
  fee: ['fees', 'management', 'services'],
  loan: ['debt', 'lend', 'borrowed'],
  charity: ['charitable', 'qualified', 'donee'],
  donation: ['gift', 'gifts', 'receipt'],
  control: ['controlled', 'votes', 'voting'],
  ccpc: ['canadian-controlled', 'private', 'corporation'],
  athlete: ['athletes', 'artistes'],
  pe: ['permanent', 'establishment'],
};

export function stem(w: string): string {
  if (w.length <= 4) return w;
  for (const suf of ['ations', 'ation', 'ings', 'ing', 'ied', 'ies', 'ed', 'es', 's']) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) return suf === 'ies' || suf === 'ied' ? w.slice(0, -suf.length) + 'y' : w.slice(0, -suf.length);
  }
  return w;
}

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:[.\-'][a-z0-9]+)*/g) ?? []).filter((t) => !STOP.has(t)).map(stem);
}

export class SearchIndex {
  private chunks: Chunk[] = [];
  private postings = new Map<string, Map<number, number>>();
  private lengths: number[] = [];
  private avgLen = 0;

  get size() {
    return this.chunks.length;
  }

  add(chunks: Chunk[]) {
    for (const ch of chunks) {
      const idx = this.chunks.length;
      this.chunks.push(ch);
      const toks = tokens(`${ch.docTitle} ${ch.section ?? ''} ${ch.citation ?? ''} ${ch.text}`);
      this.lengths.push(toks.length);
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const [t, n] of tf) {
        let p = this.postings.get(t);
        if (!p) this.postings.set(t, (p = new Map()));
        p.set(idx, n);
      }
    }
    this.avgLen = this.lengths.reduce((a, b) => a + b, 0) / Math.max(1, this.lengths.length);
  }

  removeDoc(docId: string) {
    const keep = this.chunks.filter((c) => c.docId !== docId);
    this.chunks = [];
    this.postings.clear();
    this.lengths = [];
    this.add(keep);
  }

  search(query: string, opts: { limit?: number; docIds?: string[]; hierarchy?: string[] } = {}): SearchHit[] {
    const base = tokens(query);
    const expanded = new Map<string, number>();
    for (const t of base) {
      expanded.set(t, Math.max(expanded.get(t) ?? 0, 1));
      for (const s of SYN[t] ?? []) for (const st of tokens(s)) if (!expanded.has(st)) expanded.set(st, 0.4);
    }
    const N = this.chunks.length;
    const scores = new Map<number, number>();
    const k1 = 1.2;
    const b = 0.75;
    for (const [t, w] of expanded) {
      const p = this.postings.get(t);
      if (!p) continue;
      const idf = Math.log(1 + (N - p.size + 0.5) / (p.size + 0.5));
      for (const [i, tf] of p) {
        const len = this.lengths[i] || 1;
        const s = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * len) / (this.avgLen || 1))));
        scores.set(i, (scores.get(i) ?? 0) + s * w);
      }
    }
    // Coverage boost: chunks matching more distinct query terms rank higher
    const hits: SearchHit[] = [];
    for (const [i, s] of scores) {
      const ch = this.chunks[i];
      if (opts.docIds && !opts.docIds.includes(ch.docId)) continue;
      if (opts.hierarchy && !opts.hierarchy.includes(ch.hierarchy)) continue;
      const covered = base.filter((t) => this.postings.get(t)?.has(i));
      const coverage = base.length ? covered.length / base.length : 0;
      hits.push({ chunk: ch, score: s * (0.5 + coverage), snippet: snippet(ch.text, base), terms: covered });
    }
    return hits.sort((a, b2) => b2.score - a.score).slice(0, opts.limit ?? 20);
  }
}

export function snippet(text: string, terms: string[], width = 260): string {
  const lower = text.toLowerCase();
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < lower.length; i += 80) {
    const win = lower.slice(i, i + width);
    const sc = terms.reduce((a, t) => a + (win.includes(t) ? 1 : 0), 0);
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  }
  const start = Math.max(0, best - 20);
  const s = text.slice(start, start + width).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '… ' : '') + s + (start + width < text.length ? ' …' : '');
}

/** Split long text into overlapping passages, keeping page numbers. */
export function chunkText(docId: string, docTitle: string, hierarchy: string, pages: { page?: number; text: string; section?: string }[], size = 1400): Chunk[] {
  const out: Chunk[] = [];
  let n = 0;
  for (const p of pages) {
    const t = p.text.replace(/\r/g, '');
    if (!t.trim()) continue;
    for (let i = 0; i < t.length; i += size - 200) {
      out.push({ id: `${docId}#${++n}`, docId, docTitle, hierarchy, page: p.page, section: p.section, text: t.slice(i, i + size) });
      if (i + size >= t.length) break;
    }
  }
  return out;
}
