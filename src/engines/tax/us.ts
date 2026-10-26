// U.S. federal (and New York) tax for the U.S. venture entity — computed per classification.
import type { EntityNode, SourceRef } from '../../types/domain';
import { ruleValue } from './rules';

export interface UsIncomeItem {
  kind: 'interest' | 'dividend' | 'fee' | 'royalty' | 'revenue-share' | 'gain' | 'other';
  grossUsd: number;
  /** Canadian tax withheld that is a final tax (creditable), USD. */
  foreignTaxUsd: number;
  /** Foreign-source share of the income. */
  foreignSourcePct: number;
  /** Dividend eligible for the § 245A deduction (only relevant for a C corporation ≥10% shareholder). */
  dividend245A?: boolean;
}

export interface UsTaxInput {
  year: number;
  entity: EntityNode;
  items: UsIncomeItem[];
  deductionsUsd: number; // overhead, interest paid, etc.
  nolOpeningUsd: number;
  /** Canadian Part I tax paid by the entity (e.g., branch profits) — creditable. */
  canadianIncomeTaxUsd?: number;
}

export interface UsTaxResult {
  classification: 'corporation' | 'pass-through';
  conditional: boolean;
  grossIncome: number;
  drd245A: number;
  taxableIncome: number;
  nolUsed: number;
  nolClosing: number;
  federalBeforeCredits: number;
  ftc: number;
  federal: number;
  state: number;
  memberLevelTax: number;
  totalUsTax: number;
  creditableForeignTax: number;
  uncreditedForeignTax: number;
  notes: string[];
  steps: { label: string; value: number; formula: string }[];
  sources: SourceRef[];
}

export function usTax(i: UsTaxInput, assumeForUnknown: 'corporation' | 'pass-through' = 'pass-through'): UsTaxResult {
  const cls = i.entity.tax.usClassification ?? 'unknown';
  const classification: UsTaxResult['classification'] = cls === 'corporation' ? 'corporation' : cls === 'unknown' ? assumeForUnknown : 'pass-through';
  const conditional = cls === 'unknown';
  const notes: string[] = [];
  if (conditional) notes.push(`The LLC’s U.S. classification is not confirmed. Shown as ${classification === 'corporation' ? 'a corporation' : 'a pass-through entity'} for illustration only.`);
  const gross = i.items.reduce((a, x) => a + x.grossUsd, 0);
  const foreignTax = i.items.reduce((a, x) => a + x.foreignTaxUsd, 0) + (i.canadianIncomeTaxUsd ?? 0);
  const sources: SourceRef[] = [
    { id: 'cfr-301.7701-3', label: 'Treas. Reg. § 301.7701-3' },
    { id: 'irc-7701', label: '26 U.S.C. § 7701(a)' },
    { id: 'irc-901', label: '26 U.S.C. § 901' },
    { id: 'irc-904', label: '26 U.S.C. § 904' },
  ];

  if (classification === 'corporation') {
    const corp = ruleValue('us-corp-rate', i.year);
    if (corp.note) notes.push(corp.note);
    const drd = i.items.filter((x) => x.kind === 'dividend' && x.dividend245A).reduce((a, x) => a + x.grossUsd * x.foreignSourcePct, 0);
    const taxBeforeNol = gross - drd - i.deductionsUsd;
    let nolUsed = 0;
    let nolClosing = i.nolOpeningUsd;
    let ti = 0;
    if (taxBeforeNol < 0) nolClosing += -taxBeforeNol;
    else {
      nolUsed = Math.min(i.nolOpeningUsd, taxBeforeNol * 0.8); // § 172(a)(2) 80% limitation for post-2017 NOLs
      ti = taxBeforeNol - nolUsed;
      nolClosing -= nolUsed;
    }
    const fedPre = ti * corp.value;
    // Creditable foreign taxes exclude taxes on § 245A dividends (§ 245A(d)).
    const creditable = i.items.filter((x) => !(x.kind === 'dividend' && x.dividend245A)).reduce((a, x) => a + x.foreignTaxUsd, 0) + (i.canadianIncomeTaxUsd ?? 0);
    const foreignTI = i.items.filter((x) => !(x.kind === 'dividend' && x.dividend245A)).reduce((a, x) => a + x.grossUsd * x.foreignSourcePct, 0);
    const limitShare = ti > 0 ? Math.min(1, Math.max(0, (foreignTI - i.deductionsUsd * (gross ? foreignTI / gross : 0)) / (taxBeforeNol || 1))) : 0;
    const limit = fedPre * limitShare;
    const ftc = Math.min(creditable, limit);
    const federal = Math.max(0, fedPre - ftc);
    const ny = ruleValue('ny-cft', i.year);
    const app = i.entity.tax.nyApportionment ?? 0;
    const nyRate = ti * app > 5_000_000 ? ny.value : 0.065;
    const state = Math.max(0, ti) * app * nyRate;
    if (ny.note) notes.push(`New York: ${ny.note}`);
    if (drd > 0) sources.push({ id: 'irc-245a', label: '26 U.S.C. § 245A' });
    sources.push({ id: 'irc-11', label: '26 U.S.C. § 11(b)' }, { id: 'ext-ny-budget-2026', label: 'NY 2026-27 budget (secondary source)' });
    return {
      classification,
      conditional,
      grossIncome: gross,
      drd245A: drd,
      taxableIncome: ti,
      nolUsed,
      nolClosing,
      federalBeforeCredits: fedPre,
      ftc,
      federal,
      state,
      memberLevelTax: 0,
      totalUsTax: federal + state,
      creditableForeignTax: creditable,
      uncreditedForeignTax: Math.max(0, foreignTax - ftc),
      notes,
      steps: [
        { label: 'Gross income (USD)', value: gross, formula: 'Interest + dividends + fees + royalties + other received from Canada' },
        { label: '§ 245A dividends-received deduction', value: -drd, formula: 'Foreign-source portion of dividends from a specified 10%-owned foreign corporation' },
        { label: 'Deductions', value: -i.deductionsUsd, formula: 'Overhead and interest expense' },
        { label: 'NOL used (80% limit)', value: -nolUsed, formula: 'min(NOL pool, 80% × taxable income)' },
        { label: 'Taxable income', value: ti, formula: 'Gross − DRD − deductions − NOL' },
        { label: 'Federal tax before credits', value: fedPre, formula: `TI × ${(corp.value * 100).toFixed(0)}%` },
        { label: 'Foreign tax credit', value: -ftc, formula: 'min(creditable Canadian taxes, § 904 limitation)' },
        { label: 'New York franchise tax (business income base)', value: state, formula: `TI × apportionment ${(app * 100).toFixed(0)}% × ${(nyRate * 100).toFixed(2)}%` },
      ],
      sources,
    };
  }

  // Pass-through: no entity-level federal income tax; members taxed at their own rates.
  const rate = i.entity.tax.memberMarginalRate ?? 0.408;
  const usShare = i.entity.tax.memberUsResidentShare ?? 1;
  const net = Math.max(0, gross - i.deductionsUsd);
  const memberPre = net * usShare * rate;
  const creditable = foreignTax * usShare;
  const ftc = Math.min(creditable, memberPre);
  const memberLevelTax = Math.max(0, memberPre - ftc);
  notes.push(`Member-level tax uses an assumed combined marginal rate of ${(rate * 100).toFixed(1)}% for U.S.-resident members (${(usShare * 100).toFixed(0)}% of interests). Actual rates depend on each member’s circumstances, the character of income (qualified dividends, interest) and state residence.`);
  if (usShare < 1) notes.push('Non-U.S. members are not taxed in the U.S. on foreign-source income in this model; U.S. withholding on allocations to foreign partners (§ 1446) may apply to effectively connected income.');
  sources.push({ id: 'irc-7701', label: '26 U.S.C. § 7701(a)(2) partnership' });
  return {
    classification,
    conditional,
    grossIncome: gross,
    drd245A: 0,
    taxableIncome: net,
    nolUsed: 0,
    nolClosing: 0,
    federalBeforeCredits: memberPre,
    ftc,
    federal: 0,
    state: 0,
    memberLevelTax,
    totalUsTax: memberLevelTax,
    creditableForeignTax: creditable,
    uncreditedForeignTax: Math.max(0, foreignTax - ftc),
    notes,
    steps: [
      { label: 'Net income allocated to members (USD)', value: net, formula: 'Gross income − deductions (losses pass through and are not carried here)' },
      { label: 'U.S.-resident members’ share', value: net * usShare, formula: `× ${(usShare * 100).toFixed(0)}%` },
      { label: 'Member tax before credits', value: memberPre, formula: `× assumed marginal rate ${(rate * 100).toFixed(1)}%` },
      { label: 'Foreign tax credit (member level)', value: -ftc, formula: 'min(Canadian taxes allocated, U.S. tax on that income)' },
      { label: 'Member-level U.S. tax', value: memberLevelTax, formula: 'Before-credit tax − FTC' },
    ],
    sources,
  };
}
