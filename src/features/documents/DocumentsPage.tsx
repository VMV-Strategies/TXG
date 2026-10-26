import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Card, Page, Pill, SourceLinks, StatusBadge } from '../../components/ui';
import { Icon } from '../../components/icons';
import { useRoute } from '../../app/routes';
import { useStore, toast, type DocMeta } from '../../state/store';
import { HIERARCHY_LABEL, type Hierarchy } from '../../data/sources';
import { ensureIndex, getBlob, docChunks, importFile, removeDocument } from './library';
import type { Chunk, SearchHit } from '../../engines/docs/search';
import { lookupRules } from '../../engines/docs/ruleLookup';
import { openOverlay } from '../../components/overlay';
import { WorkbookPanel } from './WorkbookPanel';

export function DocumentsPage() {
  const docs = useStore((s) => s.docs);
  const { params } = useRoute();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [scope, setScope] = useState<'all' | 'legislation' | 'mine'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<DocMeta | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [indexSize, setIndexSize] = useState(0);
  useEffect(() => {
    void ensureIndex().then((i) => setIndexSize(i.size));
  }, [docs.length]);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) return setHits([]);
      const idx = await ensureIndex();
      const hier = scope === 'legislation' ? ['enacted-legislation', 'regulation'] : undefined;
      let h = idx.search(q, { limit: 30, hierarchy: hier });
      if (scope === 'mine') h = h.filter((x) => !x.chunk.docId.startsWith('prov:'));
      setHits(h);
    }, 160);
    return () => clearTimeout(t);
  }, [q, scope, docs.length]);
  const rules = useMemo(() => lookupRules(q), [q]);
  const onFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      setBusy(`Reading ${f.name}…`);
      try {
        const res = await importFile(f);
        toast(`${f.name} imported${res.warnings.length ? ` — ${res.warnings[0]}` : ''}.`);
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`);
      }
    }
    setBusy(null);
  };
  return (
    <Page title="Document Library" subtitle="Your documents are imported into this browser only — never uploaded. Search covers the bundled legislation excerpts and everything you import, with page references.">
      <Card>
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center"
          style={{ borderColor: drag ? 'var(--accent)' : 'var(--line-2)', background: drag ? 'var(--accent-soft)' : undefined }}
          onDragOver={(e: DragEvent) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            setDrag(false);
            if (e.dataTransfer?.files) void onFiles(e.dataTransfer.files);
          }}
          data-testid="dropzone"
        >
          <Icon name="upload" size={28} className="muted" />
          <div className="text-[15px] font-medium">Drop PDF, XLSX, CSV, DOCX, TXT or Markdown files here</div>
          <div className="muted text-[13px]">Stored privately in this browser’s IndexedDB. Scanned PDFs without a text layer can be viewed but not searched.</div>
          <Button variant="primary" icon="plus" onClick={() => input.current?.click()}>
            Choose files
          </Button>
          <input ref={input} type="file" multiple accept=".pdf,.xlsx,.xlsm,.csv,.docx,.txt,.md,.markdown,text/plain,application/pdf" className="hidden" data-testid="file-input" onChange={(e: { target: HTMLInputElement }) => e.target.files && void onFiles(e.target.files)} />
          {busy ? <div className="text-[13px]" style={{ color: 'var(--accent)' }}>{busy}</div> : null}
        </div>
      </Card>
      <Card title="Search" subtitle={`${indexSize.toLocaleString()} indexed passages`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Icon name="search" size={16} className="muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input className="input pl-9" placeholder="e.g., How does Canada tax interest paid to a U.S. company?" value={q} onChange={(e: { target: HTMLInputElement }) => setQ(e.target.value)} aria-label="Search the library" data-testid="doc-search" />
          </div>
          <div className="segmented" role="group" aria-label="Scope">
            {(['all', 'legislation', 'mine'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={scope === s} onClick={() => setScope(s)}>
                {s === 'all' ? 'All' : s === 'legislation' ? 'Legislation' : 'My documents'}
              </button>
            ))}
          </div>
        </div>
        {rules.length ? (
          <div className="mt-4 space-y-3" data-testid="rule-answers">
            {rules.map((r) => (
              <Callout key={r.topic} tone="info" title={`Implemented rule: ${r.topic}`}>
                <p>{r.answer}</p>
                <div className="mt-2">
                  <SourceLinks refs={r.sources} />
                </div>
                <p className="muted mt-2 text-[12px]">{r.limitation}</p>
              </Callout>
            ))}
          </div>
        ) : q.trim() ? (
          <p className="muted mt-3 text-[13px]">No implemented rule matches this question; the passages below are the closest matches in the library. Interpretation beyond implemented rules requires professional advice.</p>
        ) : null}
        <ul className="mt-4 divide-y" style={{ borderColor: 'var(--line)' }} data-testid="search-results">
          {hits.map((h) => (
            <li key={h.chunk.id} className="py-3">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => (h.chunk.docId.startsWith('prov:') ? openOverlay({ kind: 'source', ref: { id: h.chunk.docId.slice(5), label: h.chunk.citation ?? h.chunk.docTitle } }) : setOpen(docs.find((d) => d.id === h.chunk.docId) ?? null))}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium">{h.chunk.docTitle}</span>
                  {h.chunk.page ? <Pill>p. {h.chunk.page}</Pill> : null}
                  {h.chunk.section ? <Pill>{h.chunk.section}</Pill> : null}
                  <Pill tone="accent">{HIERARCHY_LABEL[h.chunk.hierarchy as Hierarchy] ?? h.chunk.hierarchy}</Pill>
                </div>
                <p className="muted mt-1 text-[13px] leading-relaxed">{h.snippet}</p>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Your documents" subtitle={`${docs.length} imported`} pad={false}>
        {docs.length ? (
          <div className="overflow-x-auto px-2 pb-2">
            <table className="table" data-testid="doc-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Source level</th>
                  <th className="num">Pages / sheets</th>
                  <th className="num">Size</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <button type="button" className="text-left font-medium text-[var(--accent)]" onClick={() => setOpen(d)}>
                        {d.title}
                      </button>
                      {d.warnings.length ? <div className="text-[11px]" style={{ color: 'var(--warn)' }}>{d.warnings[0]}</div> : null}
                    </td>
                    <td>{d.kind.toUpperCase()}</td>
                    <td className="text-[12px]">{HIERARCHY_LABEL[d.hierarchy as Hierarchy] ?? d.hierarchy}</td>
                    <td className="num">{d.pageCount}</td>
                    <td className="num">{(d.size / 1024).toFixed(0)} KB</td>
                    <td className="text-[12px]">{new Date(d.addedAt).toLocaleDateString()}</td>
                    <td>
                      <button type="button" className="btn btn-ghost px-2" aria-label={`Delete ${d.title}`} onClick={() => confirm(`Delete “${d.title}” from this device?`) && void removeDocument(d.id)}>
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted px-5 pb-5 text-[14px]">No documents yet. Import the corporate filings, FIBA materials and the financial model to cite them locally.</p>
        )}
      </Card>
      {open ? <DocViewer doc={open} onClose={() => setOpen(null)} /> : null}
    </Page>
  );
}

function DocViewer({ doc, onClose }: { doc: DocMeta; onClose: () => void }) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [page, setPage] = useState<number | null>(null);
  useEffect(() => {
    let u: string | null = null;
    void docChunks(doc.id).then(setChunks);
    void getBlob(doc.id).then((b) => {
      if (b) {
        u = URL.createObjectURL(b);
        setUrl(u);
      }
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [doc.id]);
  const pages = Array.from(new Set(chunks.map((c) => c.page ?? c.section ?? 0)));
  const shown = chunks.filter((c) => page === null || (c.page ?? c.section) === page);
  return (
    <Card title={doc.title} subtitle={<><StatusBadge status={doc.confidential ? 'corporate-record' : 'assumption'} label={doc.confidential ? 'Private — this device only' : 'Shareable'} /> {doc.kind.toUpperCase()} · {doc.pageCount} {doc.kind === 'xlsx' ? 'sheets' : 'pages'}</>} actions={<>{url ? <a className="btn btn-secondary" href={url} target="_blank" rel="noopener" download={doc.kind === 'pdf' ? undefined : doc.name}>Open original</a> : null}<Button onClick={onClose}>Close</Button></>}>
      {doc.kind === 'xlsx' ? <WorkbookPanel docId={doc.id} /> : null}
      {doc.kind === 'pdf' && url ? <iframe src={url} title={`Preview of ${doc.title}`} className="mb-4 h-[60dvh] w-full rounded-xl border hairline" /> : null}
      <div className="mb-2 flex flex-wrap gap-1.5">
        <button type="button" className="badge" style={{ background: page === null ? 'var(--accent-soft)' : 'var(--card-2)' }} onClick={() => setPage(null)}>
          All
        </button>
        {pages.slice(0, 80).map((p) => (
          <button key={String(p)} type="button" className="badge" style={{ background: page === p ? 'var(--accent-soft)' : 'var(--card-2)' }} onClick={() => setPage(p as number)}>
            {typeof p === 'number' ? `p. ${p}` : p}
          </button>
        ))}
      </div>
      <div className="max-h-[50dvh] space-y-3 overflow-y-auto rounded-xl p-3 text-[13px] leading-relaxed" style={{ background: 'var(--card-2)' }}>
        {shown.length ? shown.map((c) => <p key={c.id} className="whitespace-pre-wrap">{c.text}</p>) : <p className="muted">No extracted text (scanned or empty document).</p>}
      </div>
    </Card>
  );
}
