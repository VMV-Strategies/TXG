// Canadian federal + Ontario corporate income tax for one corporation-year.
import type { SourceRef } from '../../types/domain';
import { ruleValue } from './rules';

export interface CaTaxInput {
  year: number;
  /** Net income for tax before loss carryforward (CAD). */
  incomeBeforeLosses: number;
  /** Portion of income that is active business income carried on in Canada. */
  activeBusinessIncome: number;
  lossPoolOpening: number;
  ccpcEligible: boolean;
  businessLimitShare: number; // 0..1 of the $500k
  associatedTaxableCapital: number;
  aaii: number;
}

export interface CaTaxResult {
  year: number;
  taxableIncome: number;
  lossUsed: number;
  lossCreated: number;
  lossPoolClosing: number;
  businessLimit: number;
  businessLimitOntario: number;
  sbdIncome: number;
  federalTax: number;
  ontarioTax: number;
  totalTax: number;
  effectiveRate: number;
  federalRateGeneral: number;
  federalRateSmall: number;
  ontarioRateGeneral: number;
  ontarioRateSmall: number;
  verified: boolean;
  notes: string[];
  steps: { label: string; value: number; formula: string }[];
  sources: SourceRef[];
}

export function canadianCorporateTax(i: CaTaxInput): CaTaxResult {
  const basic = ruleValue('ca-fed-basic-rate', i.year);
  const abat = ruleValue('ca-fed-abatement', i.year);
  const grr = ruleValue('ca-fed-grr', i.year);
  const sbdR = ruleValue('ca-fed-sbd-rate', i.year);
  const bl = ruleValue('ca-business-limit', i.year);
  const onGen = ruleValue('on-general-rate', i.year);
  const onSmall = ruleValue('on-small-rate', i.year);
  const notes: string[] = [];
  for (const r of [basic, abat, grr, sbdR, bl, onGen, onSmall]) if (r.note) notes.push(`${r.rule.name}: ${r.note}`);

  let lossUsed = 0;
  let lossCreated = 0;
  let taxableIncome = 0;
  if (i.incomeBeforeLosses < 0) {
    lossCreated = -i.incomeBeforeLosses;
  } else {
    lossUsed = Math.min(i.lossPoolOpening, i.incomeBeforeLosses);
    taxableIncome = i.incomeBeforeLosses - lossUsed;
  }
  const lossPoolClosing = i.lossPoolOpening - lossUsed + lossCreated;

  // Business limit and grinds (s. 125(2)-(5.1))
  const base = bl.value * Math.max(0, Math.min(1, i.businessLimitShare));
  const capGrind = base * Math.max(0, Math.min(40_000_000, i.associatedTaxableCapital - 10_000_000)) / 40_000_000;
  const passiveGrind = 5 * Math.max(0, i.aaii - 50_000);
  const businessLimit = Math.max(0, base - Math.max(capGrind, passiveGrind));
  const businessLimitOntario = Math.max(0, base - capGrind); // Ontario does not parallel the passive-income grind
  if (passiveGrind > capGrind && passiveGrind > 0) notes.push('Passive-income grind reduces the federal business limit; Ontario’s limit is not reduced by it (confirm).');

  const sbdIncome = i.ccpcEligible ? Math.max(0, Math.min(i.activeBusinessIncome, taxableIncome, businessLimit)) : 0;
  const sbdIncomeOn = i.ccpcEligible ? Math.max(0, Math.min(i.activeBusinessIncome, taxableIncome, businessLimitOntario)) : 0;
  const fullRate = taxableIncome - sbdIncome;
  const federalTax = taxableIncome * (basic.value - abat.value) - fullRate * grr.value - sbdIncome * sbdR.value;
  const ontarioTax = (taxableIncome - sbdIncomeOn) * onGen.value + sbdIncomeOn * onSmall.value;
  const totalTax = Math.max(0, federalTax) + Math.max(0, ontarioTax);

  const steps = [
    { label: 'Income before loss carryforward', value: i.incomeBeforeLosses, formula: 'Operating income − deductible interest − deductible fees − CCA proxy' },
    { label: 'Non-capital losses applied', value: -lossUsed, formula: 'min(opening loss pool, income)' },
    { label: 'Taxable income', value: taxableIncome, formula: 'Income − losses applied (not below zero)' },
    { label: 'Business limit (federal)', value: businessLimit, formula: '$500,000 × share − max(taxable-capital grind, passive grind)' },
    { label: 'Income eligible for small business deduction', value: sbdIncome, formula: i.ccpcEligible ? 'min(active business income, taxable income, business limit)' : 'Nil — CCPC status not assumed' },
    { label: 'Federal tax', value: federalTax, formula: `TI × (${pct(basic.value)} − ${pct(abat.value)}) − full-rate TI × ${pct(grr.value)} − SBD income × ${pct(sbdR.value)}` },
    { label: 'Ontario tax', value: ontarioTax, formula: `general income × ${pct(onGen.value)} + SBD income × ${pct(onSmall.value)}` },
    { label: 'Total corporate income tax', value: totalTax, formula: 'Federal + Ontario' },
  ];

  return {
    year: i.year,
    taxableIncome,
    lossUsed,
    lossCreated,
    lossPoolClosing,
    businessLimit,
    businessLimitOntario,
    sbdIncome,
    federalTax: Math.max(0, federalTax),
    ontarioTax: Math.max(0, ontarioTax),
    totalTax,
    effectiveRate: taxableIncome > 0 ? totalTax / taxableIncome : 0,
    federalRateGeneral: basic.value - abat.value - grr.value,
    federalRateSmall: basic.value - abat.value - sbdR.value,
    ontarioRateGeneral: onGen.value,
    ontarioRateSmall: onSmall.value,
    verified: [basic, abat, grr, sbdR, bl, onGen, onSmall].every((r) => r.verified),
    notes,
    steps,
    sources: [
      { id: 'ita-123-1', label: 'ITA s. 123(1)' },
      { id: 'ita-124-1', label: 'ITA s. 124(1)' },
      { id: 'ita-123.4', label: 'ITA s. 123.4' },
      { id: 'ita-125-1', label: 'ITA s. 125(1)' },
      { id: 'ita-125-2', label: 'ITA s. 125(2)-(5.1)' },
      { id: 'ita-111-1', label: 'ITA s. 111(1)(a)' },
      { id: 'ext-ontario-cit', label: 'Ontario corporate income tax (ontario.ca)' },
    ],
  };
}

const pct = (n: number) => `${(n * 100).toFixed(2).replace(/\.00$/, '')}%`;

export interface ThinCapInput {
  averageDebtToSpecifiedNR: number;
  retainedEarningsStart: number;
  contributedSurplusFromSNR: number;
  pucOfSNRShares: number;
  interestToSNR: number;
}

/** ITA s. 18(4): proportion of interest on debts to specified non-residents exceeding 1.5 × equity amount. */
export function thinCap(i: ThinCapInput, year: number) {
  const ratio = ruleValue('ca-thin-cap', year).value;
  const equity = Math.max(0, i.retainedEarningsStart) + Math.max(0, i.contributedSurplusFromSNR) + Math.max(0, i.pucOfSNRShares);
  const permitted = ratio * equity;
  const excess = Math.max(0, i.averageDebtToSpecifiedNR - permitted);
  const fraction = i.averageDebtToSpecifiedNR > 0 ? excess / i.averageDebtToSpecifiedNR : 0;
  return { equityAmount: equity, permittedDebt: permitted, excessDebt: excess, disallowedInterest: i.interestToSNR * fraction, fraction };
}

/** ITA s. 18.2 (approximate): returns disallowed net interest when not an excluded entity. */
export function eifel(args: { year: number; ccpc: boolean; associatedTaxableCapital: number; groupNetInterest: number; netInterest: number; ebitdaProxy: number }) {
  const ratio = ruleValue('ca-eifel', args.year).value;
  const excludedA = args.ccpc && args.associatedTaxableCapital < 50_000_000;
  const excludedB = args.groupNetInterest <= 1_000_000;
  const excluded = excludedA || excludedB;
  const capacity = Math.max(0, args.ebitdaProxy) * ratio;
  const disallowed = excluded ? 0 : Math.max(0, args.netInterest - capacity);
  return {
    excluded,
    reason: excludedA ? 'Excluded entity: CCPC with associated-group taxable capital under $50 million (s. 18.2(1) "excluded entity" (a)).' : excludedB ? 'Excluded entity: group net interest and financing expenses of $1 million or less (para. (b)).' : 'Not an excluded entity on the facts modelled; 30% of adjusted taxable income (approximated by EBITDA) caps net interest.',
    capacity,
    disallowed,
  };
}
