// Source register: every citation id used by the engines resolves here.
// Hierarchy follows PRD §18. Bundled legislation excerpts are public law; private
// documents (corporate filings, financial model, FIBA PDFs) are referenced by
// metadata only and are imported locally by the user into the Document Library.
import provisions from './source-metadata/provisions.json';
import { EXTERNAL_SOURCES } from '../engines/tax/rules';

export type Hierarchy =
  | 'enacted-legislation'
  | 'regulation'
  | 'binding-agreement'
  | 'government-guidance'
  | 'fiba-rule'
  | 'corporate-document'
  | 'financial-template'
  | 'professional-commentary'
  | 'user-assumption'
  | 'generated-analysis';

export const HIERARCHY_LABEL: Record<Hierarchy, string> = {
  'enacted-legislation': '1 · Enacted legislation',
  regulation: '2 · Regulations',
  'binding-agreement': '3 · Binding agreements',
  'government-guidance': '4 · Official government guidance',
  'fiba-rule': '5 · Official FIBA rules',
  'corporate-document': '6 · Corporate documents',
  'financial-template': '7 · Financial templates',
  'professional-commentary': '8 · Professional commentary',
  'user-assumption': '9 · User assumptions',
  'generated-analysis': '10 · Generated analysis',
};

export interface Provision {
  id: string;
  jurisdiction: string;
  authority: string;
  title: string;
  citation: string;
  sourceFile: string;
  lineStart: number;
  lineEnd: number;
  text: string;
}

export const PROVISIONS = provisions as Provision[];

export interface SourceEntry {
  id: string;
  title: string;
  authority: string;
  jurisdiction: string;
  hierarchy: Hierarchy;
  currency: string; // "current to" / effective date description
  reviewedOn: string;
  status: 'current' | 'historical' | 'proposed' | 'superseded' | 'unknown';
  private: boolean;
  url?: string;
  notes?: string;
}

const REVIEWED = '2026-10-25';

export const LIBRARY_SOURCES: SourceEntry[] = [
  { id: 'lib-ita', title: 'Income Tax Act (R.S.C. 1985, c. 1 (5th Supp.))', authority: 'Parliament of Canada — Justice Laws consolidation', jurisdiction: 'CA', hierarchy: 'enacted-legislation', currency: 'Consolidated text supplied with the project; includes 2026 amendments (e.g., 2026, c. 3 transfer-pricing changes).', reviewedOn: REVIEWED, status: 'current', private: false },
  { id: 'lib-itr', title: 'Income Tax Regulations (C.R.C., c. 945)', authority: 'Governor in Council', jurisdiction: 'CA', hierarchy: 'regulation', currency: 'Consolidated text supplied with the project.', reviewedOn: REVIEWED, status: 'current', private: false },
  { id: 'lib-treaty', title: 'Canada–United States Tax Convention Act, 1984 (Convention and Protocols)', authority: 'Parliament of Canada', jurisdiction: 'CA-US', hierarchy: 'enacted-legislation', currency: 'Convention (1980) with Protocols of 1983, 1984, 1995, 1997 and 2007 (Fifth Protocol, in force Dec. 15, 2008). Text is not consolidated — amendments are read with the original articles.', reviewedOn: REVIEWED, status: 'current', private: false },
  { id: 'lib-eta', title: 'Excise Tax Act (GST/HST)', authority: 'Parliament of Canada', jurisdiction: 'CA', hierarchy: 'enacted-legislation', currency: 'Consolidated text supplied with the project.', reviewedOn: REVIEWED, status: 'current', private: false },
  { id: 'lib-nfp', title: 'Canada Not-for-profit Corporations Act (S.C. 2009, c. 23)', authority: 'Parliament of Canada', jurisdiction: 'CA', hierarchy: 'enacted-legislation', currency: 'Consolidated text supplied with the project. The NFP Regulations (prescribed soliciting threshold) are not in the library.', reviewedOn: REVIEWED, status: 'current', private: false },
  { id: 'lib-cbca', title: 'Canada Business Corporations Act (R.S.C. 1985, c. C-44)', authority: 'Parliament of Canada', jurisdiction: 'CA', hierarchy: 'enacted-legislation', currency: 'Consolidated text supplied with the project.', reviewedOn: REVIEWED, status: 'current', private: false },
  { id: 'lib-cpp', title: 'Canada Pension Plan', authority: 'Parliament of Canada', jurisdiction: 'CA', hierarchy: 'enacted-legislation', currency: 'Consolidated text supplied with the project; annual thresholds from CRA.', reviewedOn: REVIEWED, status: 'current', private: false },
  { id: 'lib-ei', title: 'Employment Insurance Act', authority: 'Parliament of Canada', jurisdiction: 'CA', hierarchy: 'enacted-legislation', currency: 'Consolidated text supplied with the project; annual rate set by the Commission.', reviewedOn: REVIEWED, status: 'current', private: false },
  { id: 'lib-irc', title: 'Internal Revenue Code (26 U.S.C.)', authority: 'U.S. Congress — Office of the Law Revision Counsel', jurisdiction: 'US', hierarchy: 'enacted-legislation', currency: 'Release point current through Pub. L. 119-102 (July 12, 2026), except 119-101.', reviewedOn: REVIEWED, status: 'current', private: false },
  { id: 'lib-26cfr', title: 'Treasury Regulations (26 CFR)', authority: 'U.S. Treasury / IRS — eCFR', jurisdiction: 'US', hierarchy: 'regulation', currency: 'eCFR Title 26 as last amended 2026-10-06.', reviewedOn: REVIEWED, status: 'current', private: false },
  ...EXTERNAL_SOURCES.map((e) => ({ id: e.id, title: e.label, authority: e.kind, jurisdiction: e.id.includes('ny') ? 'US-NY' : 'CA', hierarchy: (e.kind === 'Official government guidance' ? 'government-guidance' : 'professional-commentary') as Hierarchy, currency: `Reviewed ${e.reviewedOn}`, reviewedOn: e.reviewedOn, status: 'current' as const, private: false, url: e.url })),
  { id: 'fiba-b6', title: 'FIBA Internal Regulations — Book 6: 3x3', authority: 'FIBA', jurisdiction: 'INTL', hierarchy: 'fiba-rule', currency: 'In force as of 22 April 2026', reviewedOn: REVIEWED, status: 'current', private: true, notes: 'Uploaded PDF (33 pp.). Import into the Document Library to open citations.' },
  { id: 'fiba-b6-6', title: 'Book 6, Chapter 1 — Governance and main principles (arts. 6-5 to 6-19)', authority: 'FIBA', jurisdiction: 'INTL', hierarchy: 'fiba-rule', currency: 'In force 22 April 2026', reviewedOn: REVIEWED, status: 'current', private: true },
  { id: 'fiba-b6-ch4', title: 'Book 6, Chapter 4 — FIBA 3x3 Pro Circuit (World Tour, Challengers, Women’s Series)', authority: 'FIBA', jurisdiction: 'INTL', hierarchy: 'fiba-rule', currency: 'In force 22 April 2026', reviewedOn: REVIEWED, status: 'current', private: true },
  { id: 'fiba-b6-ch5', title: 'Book 6, Chapter 5 — FIBA endorsed 3x3 events', authority: 'FIBA', jurisdiction: 'INTL', hierarchy: 'fiba-rule', currency: 'In force 22 April 2026', reviewedOn: REVIEWED, status: 'current', private: true },
  { id: 'fiba-b6-ch7', title: 'Book 6, Chapter 7 — Disciplinary', authority: 'FIBA', jurisdiction: 'INTL', hierarchy: 'fiba-rule', currency: 'In force 22 April 2026', reviewedOn: REVIEWED, status: 'current', private: true },
  { id: 'fiba-team-tour-2017', title: 'Guide to FIBA 3x3 Team Tour (2017)', authority: 'FIBA', jurisdiction: 'INTL', hierarchy: 'fiba-rule', currency: '2017 — historical guide', reviewedOn: REVIEWED, status: 'historical', private: true, notes: 'Historical organiser guide; not a substitute for current hosting agreements.' },
  { id: 'fiba-player-tour-2017', title: 'Guide to FIBA 3x3 Player Tour (2017)', authority: 'FIBA', jurisdiction: 'INTL', hierarchy: 'fiba-rule', currency: '2017 — historical guide', reviewedOn: REVIEWED, status: 'historical', private: true },
  { id: 'fiba-nl-case', title: 'Case study — Netherlands and 3x3', authority: 'FIBA / Basketball Nederland (presentation)', jurisdiction: 'INTL', hierarchy: 'professional-commentary', currency: 'Undated presentation (c. 2017)', reviewedOn: REVIEWED, status: 'historical', private: true },
  { id: 'fiba-everybody', title: 'Everybody can be successful with 3x3 — role of national federations', authority: 'FIBA (presentation)', jurisdiction: 'INTL', hierarchy: 'professional-commentary', currency: 'Undated presentation', reviewedOn: REVIEWED, status: 'historical', private: true },
  { id: 'fiba-web', title: 'fiba3x3.com website printouts (home, vision)', authority: 'FIBA', jurisdiction: 'INTL', hierarchy: 'professional-commentary', currency: 'Captured 25 Oct 2026', reviewedOn: REVIEWED, status: 'current', private: true, notes: 'Promotional; event calendar only.' },
  { id: 'corp-nfp-cert', title: 'Foundation — Certificate and Articles of Incorporation (NFP Act Form 4001/4002)', authority: 'Corporations Canada', jurisdiction: 'CA', hierarchy: 'corporate-document', currency: 'See private fact pack', reviewedOn: REVIEWED, status: 'current', private: true },
  { id: 'corp-nfp-amend', title: 'Foundation — Certificate and Articles of Amendment (name change)', authority: 'Corporations Canada', jurisdiction: 'CA', hierarchy: 'corporate-document', currency: 'See private fact pack', reviewedOn: REVIEWED, status: 'current', private: true },
  { id: 'corp-se-isc', title: 'Operator — Initial individuals with significant control (CBCA s. 21.21)', authority: 'Corporations Canada', jurisdiction: 'CA', hierarchy: 'corporate-document', currency: 'See private fact pack', reviewedOn: REVIEWED, status: 'current', private: true },
  { id: 'corp-se-on', title: 'Operator — Ontario extra-provincial registration / initial return', authority: 'Corporations Canada / ServiceOntario', jurisdiction: 'CA-ON', hierarchy: 'corporate-document', currency: 'See private fact pack', reviewedOn: REVIEWED, status: 'current', private: true },
  { id: 'corp-txg', title: 'U.S. venture LLC — address and tax ID (user-provided)', authority: 'User', jurisdiction: 'US-NY', hierarchy: 'corporate-document', currency: 'See private fact pack', reviewedOn: REVIEWED, status: 'current', private: true },
  { id: 'wb-txg-v11', title: 'Three X Global Operating Company Financial Model V1.1', authority: 'Management', jurisdiction: 'NA', hierarchy: 'financial-template', currency: 'Model date 2026-09-06; confidential management draft; not an offering document', reviewedOn: REVIEWED, status: 'current', private: true, notes: 'Import the .xlsx locally to run the reconciliation.' },
];

export function findProvision(id: string): Provision | undefined {
  return PROVISIONS.find((p) => p.id === id);
}

export function findSource(id: string): SourceEntry | undefined {
  return LIBRARY_SOURCES.find((s) => s.id === id);
}

/** Every SourceRef id used by engines must resolve to a provision or a register entry (tested). */
export function resolveSourceId(id: string): { kind: 'provision'; p: Provision } | { kind: 'source'; s: SourceEntry } | null {
  const p = findProvision(id);
  if (p) return { kind: 'provision', p };
  const s = findSource(id);
  if (s) return { kind: 'source', s };
  return null;
}

export function provisionHierarchy(p: Provision): Hierarchy {
  return p.authority.includes('Regulations') || p.authority.includes('Treasury') ? 'regulation' : 'enacted-legislation';
}
