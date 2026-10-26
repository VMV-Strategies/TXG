import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { SearchIndex, chunkText, stem, tokens } from '../../src/engines/docs/search';
import { extractDocx, extractText, extractXlsx, kindOf, extractPdf, type PdfLib } from '../../src/engines/docs/extract';
import { lookupRules } from '../../src/engines/docs/ruleLookup';
import { PROVISIONS, resolveSourceId, LIBRARY_SOURCES } from '../../src/data/sources';
import { GLOSSARY } from '../../src/data/glossary';
import { FIBA_REQUIREMENTS } from '../../src/data/fiba';
import { TAX_RULES } from '../../src/engines/tax/rules';
import { computeScenario } from '../../src/engines/scenarios/compute';
import { defaultScenarios } from '../../src/data/synthetic/defaultScenario';
import { applyPreset, PRESETS } from '../../src/engines/optimization/optimize';
import { writeXlsx } from '../../src/engines/workbook/xlsx';
import { REPORT_TYPES, buildReport } from '../../src/features/reports/build';
import { reportToCsv } from '../../src/features/reports/exporters';

function provisionIndex() {
  const idx = new SearchIndex();
  idx.add(PROVISIONS.map((p) => ({ id: p.id, docId: `prov:${p.id}`, docTitle: `${p.citation} — ${p.title}`, hierarchy: 'enacted-legislation', citation: p.citation, text: p.text })));
  return idx;
}

test('tokenizer and stemmer', () => {
  assert.equal(stem('dividends'), 'dividend');
  assert.equal(stem('royalties'), 'royalty');
  assert.deepEqual(tokens('How does Canada tax interest?'), ['canada', 'tax', 'interest']);
});

test('search: interest paid to a U.S. company returns the Part XIII and treaty interest provisions', () => {
  const hits = provisionIndex().search('How does Canada tax interest paid to a U.S. company?', { limit: 8 });
  const ids = hits.map((h) => h.chunk.id);
  assert.ok(ids.includes('ita-212-1') || ids.includes('tr-xi-5p'), ids.join(','));
  assert.ok(hits[0].snippet.length > 20);
});

test('search: thin capitalization', () => {
  const hits = provisionIndex().search('specified non-resident debt equity interest deduction limit', { limit: 5 });
  assert.ok(hits.some((h) => h.chunk.id === 'ita-18-4' || h.chunk.id === 'ita-18-5-defs'));
});

test('rule lookup answers implemented topics with citations and a limitation', () => {
  const a = lookupRules('How does Canada tax interest paid to a U.S. company?');
  assert.equal(a[0].topic, 'Interest paid from Canada to a U.S. company');
  assert.ok(a[0].sources.length >= 2);
  assert.match(a[0].limitation, /adviser/);
  assert.deepEqual(lookupRules('weather tomorrow'), []);
});

test('document extraction: txt, docx, xlsx; kind detection', async () => {
  assert.equal(kindOf('a.PDF'), 'pdf');
  assert.equal(kindOf('model.xlsx'), 'xlsx');
  assert.equal(kindOf('notes.md'), 'md');
  const t = extractText('x'.repeat(20000), 'txt');
  assert.equal(t.pageCount, 3);
  const z = new JSZip();
  z.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Hosting fee &amp; rights</w:t></w:r></w:p><w:p><w:r><w:t>Payment schedule</w:t></w:r></w:p></w:body></w:document>');
  const d = await extractDocx(await z.generateAsync({ type: 'uint8array' }));
  assert.match(d.pages[0].text, /Hosting fee & rights\nPayment schedule/);
  const blob = await writeXlsx([{ name: 'Budget', rows: [['Venue', 290000]] }]);
  const x = await extractXlsx(new Uint8Array(await blob.arrayBuffer()));
  assert.equal(x.pages[0].section, 'Budget');
  assert.match(x.pages[0].text, /Venue \| 290000/);
});

test('document extraction: PDF via pdf.js (legacy build in Node)', async () => {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfLib;
  // Minimal one-page PDF with a text layer
  const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 10 50 Td (Book 6 prize money) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
  const ex = await extractPdf(new TextEncoder().encode(pdf), pdfjs);
  assert.equal(ex.pageCount, 1);
  assert.match(ex.pages[0].text, /prize money/);
});

test('chunking keeps page numbers', () => {
  const c = chunkText('d', 'Doc', 'fiba-rule', [{ page: 3, text: 'a'.repeat(3000) }]);
  assert.ok(c.length >= 2);
  assert.ok(c.every((x) => x.page === 3));
});

test('source citation integrity: every source id used anywhere resolves to a provision or register entry', () => {
  const ids = new Set<string>();
  for (const r of TAX_RULES) r.authority.forEach((a) => ids.add(a));
  for (const g of GLOSSARY) g.sources?.forEach((s) => ids.add(s));
  for (const f of FIBA_REQUIREMENTS) if (f.sourceId) ids.add(f.sourceId);
  for (const s of defaultScenarios()) {
    for (const p of PRESETS) {
      const r = computeScenario(applyPreset(s, p.id), { skipComparison: true });
      r.issues.forEach((i) => i.sources.forEach((x) => ids.add(x.id)));
      r.flows.forEach((f) => f.sources.forEach((x) => ids.add(x.id)));
      r.control.tests.forEach((t) => t.sources.forEach((x) => ids.add(x.id)));
      r.nfp.checks.forEach((c) => c.sources.forEach((x) => ids.add(x.id)));
    }
  }
  for (const r of lookupRules('interest dividend royalty management ccpc thin cap eifel charity athlete permanent establishment llc hst cpp cfc fiba')) r.sources.forEach((s) => ids.add(s.id));
  const missing = [...ids].filter((id) => !resolveSourceId(id));
  assert.deepEqual(missing, []);
});

test('bundled provisions are verbatim excerpts from the supplied consolidated texts (spot check)', () => {
  const p = PROVISIONS.find((x) => x.id === 'ita-125-7-ccpc')!;
  assert.match(p.text, /^Canadian-controlled private corporation means a private corporation that is a Canadian corporation other than/);
  const t = PROVISIONS.find((x) => x.id === 'tr-x-2a-5p')!;
  assert.match(t.text, /5 percent of the gross amount of the dividends/);
  const src = path.resolve('src/data/source-metadata/provisions.json');
  assert.ok(fs.statSync(src).size > 50_000);
  assert.ok(LIBRARY_SOURCES.length > 10);
});

test('all ten reports build and export to CSV', () => {
  const s = defaultScenarios()[2];
  const r = computeScenario(s);
  for (const t of REPORT_TYPES) {
    const rep = buildReport(t.id, s, r, 'CAD');
    assert.ok(rep.summary.length > 0, t.id);
    assert.ok(rep.assumptions.length > 0, t.id);
    assert.ok(rep.sections.length > 0, t.id);
    const csv = reportToCsv(rep);
    assert.ok(csv.includes(rep.title));
  }
});
