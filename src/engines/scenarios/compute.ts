// The scenario engine: a deterministic pipeline from inputs to entity statements,
// cross-border tax, investor returns, group economics, monthly cash and
// reconciliation checks. Every UI number comes from this single function, so
// explanation modes and views can never disagree with each other.
import type { DataStatus, EntityNode, Issue, Relationship, Scenario, SourceRef } from '../../types/domain';
import { costRamp, convert, irr, loanSchedule, moic, sum, waterfall, type LoanYear } from '../finance/finance';
import { analyzeControl, isSpecifiedNonResidentShareholder, type ControlAnalysis } from '../corporate/control';
import { analyzeNfp, type NfpAnalysis } from '../corporate/nfp';
import { computeEventYear, ontarioEht, type EventYearResult } from '../events/events';
import { canadianCorporateTax, eifel, thinCap, type CaTaxResult } from '../tax/canada';
import { canadianWithholding, type PaymentKind, type WithholdingResult } from '../tax/withholding';
import { usTax, type UsIncomeItem, type UsTaxResult } from '../tax/us';

export type FlowKind =
  | 'equity'
  | 'preferred-equity'
  | 'loan-drawdown'
  | 'convertible'
  | 'capital-contribution'
  | 'interest'
  | 'principal'
  | 'dividend'
  | 'deemed-dividend'
  | 'management-fee'
  | 'royalty'
  | 'revenue-share'
  | 'service-fee'
  | 'grant'
  | 'donation'
  | 'restricted-funding'
  | 'guarantee-fee'
  | 'sponsorship'
  | 'tickets'
  | 'other-revenue'
  | 'public-funding'
  | 'event-cost'
  | 'payroll'
  | 'overhead'
  | 'tax'
  | 'distribution'
  | 'exit-proceeds';

export interface Flow {
  id: string;
  year: number;
  month: number;
  from: string;
  to: string;
  kind: FlowKind;
  gross: number; // CAD
  withholding: number; // CAD, remitted to the Canadian government by the payer
  net: number; // CAD received
  relId?: string;
  eventId?: string;
  internal: boolean;
  capital: boolean;
  legalBasis: string;
  accounting: string;
  taxTreatment: string;
  explanation: string;
  sources: SourceRef[];
  withholdingDetail?: WithholdingResult;
  status: DataStatus;
}

export interface EntityYear {
  year: number;
  eventRevenue: number;
  eventCosts: number;
  overhead: number;
  eht: number;
  ebitda: number;
  interestExpense: number;
  interestIncome: number;
  feesPaid: number;
  feesReceived: number;
  royaltiesPaid: number;
  royaltiesReceived: number;
  revSharePaid: number;
  revShareReceived: number;
  dividendsPaid: number;
  dividendsReceived: number;
  grantsReceived: number;
  grantsPaid: number;
  servicesReceived: number;
  servicesPaid: number;
  nonDeductibleInterest: number;
  nonDeductibleFees: number;
  ccaProxy: number;
  incomeBeforeTax: number;
  caTax?: CaTaxResult;
  usTax?: UsTaxResult;
  usTaxAlt?: UsTaxResult;
  canadianBranchTax: number;
  incomeTax: number; // CAD (CA corporate tax or US tax converted)
  withholdingSuffered: number; // final Canadian taxes withheld from receipts
  withholdingRecoverable: number; // Reg. 105 amounts (payments on account)
  netIncome: number;
  capitalIn: number;
  capitalOut: number;
  cashIn: number;
  cashOut: number;
  openingCash: number;
  closingCash: number;
  retainedEarnings: number;
  debtOutstanding: number;
  equityContributed: number;
}

export interface MonthlyRow {
  month: number;
  inflow: number;
  outflow: number;
  net: number;
  closing: number;
  preFinancingCumulative: number;
}

export interface InvestorResult {
  flows: { year: number; amount: number; label: string }[];
  flowsAfterTax: { year: number; amount: number }[];
  irr: number | null;
  irrAfterTax: number | null;
  moic: number | null;
  invested: number; // CAD
  distributions: number;
  exitProceeds: number;
  exitBreakdown: { label: string; amount: number }[];
  waterfall?: ReturnType<typeof waterfall>;
}

export interface GroupResult {
  externalRevenue: number;
  externalCosts: number;
  groupPreTax: number;
  canadianCorporateTax: number;
  withholdingFinal: number;
  withholdingRecoverable: number;
  usTax: number;
  totalTax: number;
  afterTaxValue: number;
  operatorRetained: number;
  txgAfterTax: number;
  eliminated: number;
  leakageRate: number;
  taxByEntity: Record<string, number>;
}

export interface ReconCheck {
  id: string;
  label: string;
  diff: number;
  ok: boolean;
}

export interface ScenarioResult {
  scenarioId: string;
  years: number[];
  fx: Record<number, number>;
  events: EventYearResult[];
  entityYears: Record<string, EntityYear[]>;
  flows: Flow[];
  loans: Record<string, LoanYear[]>;
  control: ControlAnalysis;
  nfp: NfpAnalysis;
  investor: InvestorResult;
  txgReturns: InvestorResult;
  group: GroupResult;
  monthly: Record<string, MonthlyRow[]>;
  peakFunding: { entityId: string; year: number; amount: number; month: number | null; selfSustainingMonth: number | null };
  cumulativeCashNeed: number;
  breakEven: { year: number; operatingGap: number; allInGap: number; eventsGap: number }[];
  reconciliation: { ok: boolean; checks: ReconCheck[] };
  issues: Issue[];
  totals: {
    revenue: number;
    costs: number;
    ebitda: number;
    netIncome: number;
    taxes: number;
    withholding: number;
    capitalInvested: number;
    interest: number;
    debt: number;
  };
  comparison?: { neutralTotalTax: number; delta: number; deltaByEntity: Record<string, number>; label: string };
}

const S = (id: string, label: string): SourceRef => ({ id, label });
let flowSeq = 0;

function fxFor(scn: Scenario, year: number): number {
  const known = scn.fx.cadPerUsd;
  if (known[year]) return known[year];
  const ys = Object.keys(known).map(Number).sort((a, b) => a - b);
  const prior = ys.filter((y) => y <= year).pop() ?? ys[0];
  return known[prior] ?? 1.35;
}

const blankYear = (year: number): EntityYear => ({
  year,
  eventRevenue: 0,
  eventCosts: 0,
  overhead: 0,
  eht: 0,
  ebitda: 0,
  interestExpense: 0,
  interestIncome: 0,
  feesPaid: 0,
  feesReceived: 0,
  royaltiesPaid: 0,
  royaltiesReceived: 0,
  revSharePaid: 0,
  revShareReceived: 0,
  dividendsPaid: 0,
  dividendsReceived: 0,
  grantsReceived: 0,
  grantsPaid: 0,
  servicesReceived: 0,
  servicesPaid: 0,
  nonDeductibleInterest: 0,
  nonDeductibleFees: 0,
  ccaProxy: 0,
  incomeBeforeTax: 0,
  canadianBranchTax: 0,
  incomeTax: 0,
  withholdingSuffered: 0,
  withholdingRecoverable: 0,
  netIncome: 0,
  capitalIn: 0,
  capitalOut: 0,
  cashIn: 0,
  cashOut: 0,
  openingCash: 0,
  closingCash: 0,
  retainedEarnings: 0,
  debtOutstanding: 0,
  equityContributed: 0,
});

export interface ComputeOptions {
  /** Skip the neutral-structure comparison (used internally to avoid recursion). */
  skipComparison?: boolean;
}

export function computeScenario(scn: Scenario, opts: ComputeOptions = {}): ScenarioResult {
  flowSeq = 0;
  const years = [...scn.years].sort((a, b) => a - b);
  const fx: Record<number, number> = Object.fromEntries(years.map((y) => [y, fxFor(scn, y)]));
  const ents = new Map(scn.entities.map((e) => [e.id, e] as const));
  const issues: Issue[] = [];
  const flows: Flow[] = [];
  const op = scn.roles.operator;
  const txg = scn.roles.usVenture;
  const inGroup = (id: string) => !!ents.get(id)?.inGroup;
  const toCad = (amount: number, cur: 'CAD' | 'USD', year: number, rel?: Relationship) =>
    convert(amount, cur, 'CAD', scn.fx.mode === 'transaction' && rel?.fxAtTransaction ? rel.fxAtTransaction : fx[year]);

  const control = analyzeControl(scn);
  const ccpcAuto = control.status === 'likely-ccpc';
  const ccpcEligible = scn.taxSettings.sbdTreatment === 'assume-eligible' ? true : scn.taxSettings.sbdTreatment === 'assume-ineligible' ? false : ccpcAuto;

  // ---------- Level 1: events ----------
  const events: EventYearResult[] = [];
  for (const ev of scn.events) for (const y of years) {
    const r = computeEventYear(ev, y, scn, scn.assumptions.sponsorshipBasis);
    if (r) events.push(r);
  }

  // ---------- Entity-year containers ----------
  const EY: Record<string, EntityYear[]> = {};
  for (const e of scn.entities) EY[e.id] = years.map((y) => blankYear(y));
  const ey = (id: string, year: number) => {
    if (!EY[id]) EY[id] = years.map((y) => blankYear(y));
    return EY[id][years.indexOf(year)];
  };

  const pushFlow = (f: Omit<Flow, 'id' | 'internal' | 'net'> & { net?: number }) => {
    if (!f.gross && !f.withholding) return null;
    const full: Flow = { ...f, id: `f${++flowSeq}`, internal: inGroup(f.from) && inGroup(f.to), net: f.net ?? f.gross - f.withholding };
    flows.push(full);
    return full;
  };

  // External counterparties for operating flows
  const findKind = (kind: EntityNode['kind']) => scn.entities.find((e) => e.kind === kind)?.id ?? `ext-${kind}`;
  const fibaId = findKind('fiba');
  const venueId = findKind('venue');
  const vendorsId = findKind('vendor');
  const staffId = findKind('staff');
  const fansId = findKind('fans');
  const sponsorsId = findKind('sponsor');
  const govId = findKind('government');

  // Operating flows from events
  for (const r of events) {
    const e = ey(r.operatorId, r.year);
    e.eventRevenue += r.revenueTotal;
    e.eventCosts += r.costTotal;
    const m = r.eventMonth;
    const base = { year: r.year, eventId: r.eventId, capital: false, status: 'assumption' as DataStatus };
    for (const d of r.sponsorDeals.filter((d) => d.cash && d.value)) {
      pushFlow({ ...base, month: d.month || m, from: sponsorsId, to: r.operatorId, kind: 'sponsorship', gross: d.value, withholding: 0, legalBasis: `Sponsorship agreement — ${d.name} (${d.status})`, accounting: 'Revenue recognised over the sponsorship term / when the event is delivered; cash received in advance is deferred revenue.', taxTreatment: 'Taxable business income of the recipient; HST applies to the sponsorship fee.', explanation: `${d.name} pays the event operator for sponsorship rights.`, sources: [S('eta-165', 'ETA s. 165')] });
    }
    if (!r.sponsorDeals.length && r.sponsorCash) pushFlow({ ...base, month: m, from: sponsorsId, to: r.operatorId, kind: 'sponsorship', gross: r.sponsorCash, withholding: 0, legalBasis: 'Sponsorship revenue (line-item assumption)', accounting: 'Revenue', taxTreatment: 'Taxable business income; HST applies.', explanation: 'Sponsorship revenue entered as a single assumption.', sources: [] });
    pushFlow({ ...base, month: m, from: fansId, to: r.operatorId, kind: 'tickets', gross: r.revenue.tickets + r.revenue.hospitality + r.revenue.fnbShare + r.revenue.merchandise, withholding: 0, legalBasis: 'Ticket terms and conditions; concession and merchandise agreements', accounting: 'Revenue recognised when the event occurs; advance sales are deferred revenue.', taxTreatment: 'Taxable business income; HST collected on tickets and remitted (not revenue).', explanation: 'Fans buy tickets, hospitality, food and merchandise.', sources: [S('eta-165', 'ETA s. 165')] });
    pushFlow({ ...base, month: m, from: vendorsId, to: r.operatorId, kind: 'other-revenue', gross: r.revenue.vendorFees + r.revenue.media + r.revenue.digital + r.revenue.other, withholding: 0, legalBasis: 'Vendor, media and digital agreements (subject to FIBA rights)', accounting: 'Revenue', taxTreatment: 'Taxable business income.', explanation: 'Vendors, media and digital partners pay the operator.', sources: [] });
    pushFlow({ ...base, month: m, from: govId, to: r.operatorId, kind: 'public-funding', gross: r.revenue.hostCityContribution + r.revenue.grantsEligible, withholding: 0, legalBasis: 'Host-city agreement / grant agreement (eligibility to be verified)', accounting: 'Government assistance — recognised as income or as a cost reduction depending on terms.', taxTreatment: 'Government assistance is generally included in income or reduces the cost of property (ITA s. 12(1)(x)).', explanation: 'Public funding for the event.', sources: [] });
    pushFlow({ ...base, month: m, from: r.operatorId, to: fibaId, kind: 'event-cost', gross: r.costs.fibaHostingFee, withholding: 0, legalBasis: 'FIBA hosting agreement (not yet executed unless marked)', accounting: 'Event cost', taxTreatment: 'Deductible if incurred to earn business income. Canadian withholding on rights fees paid to FIBA is unresolved (see issues).', explanation: 'Hosting/licence fee paid to FIBA for the right to stage the event.', sources: [S('ita-212-1', 'ITA s. 212(1)(d)')] });
    pushFlow({ ...base, month: m, from: r.operatorId, to: venueId, kind: 'event-cost', gross: r.costs.venue, withholding: 0, legalBasis: 'Venue licence agreement', accounting: 'Event cost', taxTreatment: 'Deductible; HST input tax credits recoverable for a registrant.', explanation: 'Venue rental.', sources: [] });
    pushFlow({ ...base, month: m, from: r.operatorId, to: staffId, kind: 'payroll', gross: r.costs.staffingEmployees + r.costs.staffingContractors + r.costs.payrollTaxes, withholding: 0, legalBasis: 'Employment and contractor agreements', accounting: 'Event cost', taxTreatment: 'Deductible; employer CPP/EI contributions included.', explanation: 'Staff and contractors delivering the event, plus employer payroll contributions.', sources: [S('cpp-9', 'CPP s. 9'), S('ei-67-68', 'EI Act ss. 67-68')] });
    const other = r.costCash - r.costs.fibaHostingFee - r.costs.venue - r.costs.staffingEmployees - r.costs.staffingContractors - r.costs.payrollTaxes;
    pushFlow({ ...base, month: m, from: r.operatorId, to: vendorsId, kind: 'event-cost', gross: other, withholding: 0, legalBasis: 'Production, equipment, travel, insurance and other vendor contracts', accounting: 'Event cost', taxTreatment: 'Deductible; HST input tax credits recoverable for a registrant.', explanation: 'Production, equipment, travel, marketing, insurance and other delivery costs.', sources: [] });
    if (r.nonResidentAthletePayments > 0) {
      const w = canadianWithholding('athlete-payment', r.nonResidentAthletePayments, ents.get(r.operatorId) ?? ({ tax: { residence: 'CA' } } as EntityNode), { id: 'nr-athletes', name: 'Non-resident athletes', kind: 'custom', jurisdiction: 'INTL', x: 0, y: 0, inGroup: false, tax: { residence: 'INTL' }, evidence: 'assumption', currency: 'CAD' }, { year: r.year, armsLength: 'yes', treatyClaimed: scn.taxSettings.treatyClaimed });
      issues.push({ id: `athletes-${r.eventId}-${r.year}`, severity: 'watch', area: 'withholding', title: `Host payments to non-resident athletes (${r.name} ${r.year})`, plain: `The model includes ${fmt(r.nonResidentAthletePayments)} of host payments to non-resident athletes. Canada generally requires 15% to be withheld (about ${fmt(w.amount ?? 0)}). FIBA pays prize money itself, so this only applies to money the host pays.`, sources: w.sources, resolution: 'Confirm who pays each athlete amount and obtain residence/treaty documentation or waivers.', professional: true });
    }
  }

  // Overhead, EHT and CCA proxy
  for (const e of scn.entities) for (const y of years) {
    const row = ey(e.id, y);
    const oh = toCad(e.overhead?.[y] ?? 0, e.currency, y);
    row.overhead = oh;
    if (oh) pushFlow({ year: y, month: 6, from: e.id, to: e.jurisdiction === 'US' ? 'ext-us-vendors' : vendorsId, kind: 'overhead', gross: oh, withholding: 0, capital: false, status: 'assumption', legalBasis: 'Corporate overhead (staff, rent, professional fees)', accounting: 'Operating expense', taxTreatment: 'Deductible if incurred to earn income.', explanation: `${e.name} corporate overhead.`, sources: [] });
    if (e.jurisdiction === 'CA' && e.kind !== 'individual') {
      const payroll = events.filter((r) => r.operatorId === e.id && r.year === y).reduce((a, r) => a + r.costs.staffingEmployees, 0);
      row.eht = ontarioEht(payroll, true);
      if (row.eht) pushFlow({ year: y, month: 12, from: e.id, to: 'gov-ca', kind: 'tax', gross: row.eht, withholding: 0, capital: false, status: 'legislation', legalBasis: 'Employer Health Tax Act (Ontario)', accounting: 'Payroll expense', taxTreatment: 'Deductible.', explanation: 'Ontario Employer Health Tax on payroll above the exemption.', sources: [S('ext-ontario-eht', 'Ontario EHT')] });
    }
    const capex = toCad(scn.capex?.[e.id]?.[y] ?? 0, e.currency, y);
    // straight-line proxy over ccaYears for capex incurred in this and earlier years (half-year in first year)
    let cca = 0;
    for (const py of years.filter((x) => x <= y)) {
      const c = toCad(scn.capex?.[e.id]?.[py] ?? 0, e.currency, py);
      const n = Math.max(1, scn.taxSettings.ccaYears);
      const age = y - py;
      cca += age === 0 ? c / n / 2 : age < n ? c / n : age === n ? c / n / 2 : 0;
    }
    row.ccaProxy = cca;
    if (capex) pushFlow({ year: y, month: 3, from: e.id, to: vendorsId, kind: 'event-cost', gross: capex, withholding: 0, capital: true, status: 'assumption', legalBasis: 'Capital expenditure', accounting: 'Capitalised; depreciated', taxTreatment: 'Capital cost allowance (proxied straight-line).', explanation: 'Platform / equipment capital spending.', sources: [] });
  }
  for (const e of scn.entities) for (const y of years) {
    const row = ey(e.id, y);
    row.ebitda = row.eventRevenue - row.eventCosts - row.overhead - row.eht;
  }

  // ---------- Financing relationships ----------
  const loans: Record<string, LoanYear[]> = {};
  const loanRels = scn.relationships.filter((r) => (r.type === 'intercompany-loan' || r.type === 'third-party-loan') && r.loan);
  for (const r of loanRels) loans[r.id] = loanSchedule(r.amount, r.startYear, r.loan!, years);
  const convRels = scn.relationships.filter((r) => r.type === 'convertible' && r.convertible);
  for (const r of convRels) loans[r.id] = loanSchedule(r.amount, r.startYear, { rate: r.convertible!.rate, termYears: r.convertible!.termYears, repayment: 'maturity', cashInterest: true }, years).map((l) => (r.convertible!.convertAtMaturity && l.year === r.startYear + r.convertible!.termYears - 1 ? { ...l, principal: 0, closing: l.opening + l.drawdown } : l));

  // Equity contributed by holder into investee (for thin cap PUC and exit values)
  const equityRels = scn.relationships.filter((r) => r.type === 'common-shares' || r.type === 'preferred-shares');

  const wctx = (r: Relationship, year: number, extra: Partial<Parameters<typeof canadianWithholding>[4]> = {}) => {
    const recipient = ents.get(r.to);
    const holder = control.holders.find((h) => h.holderId === r.to);
    return { year, armsLength: recipient?.tax.armsLengthWithOperator ?? 'unknown', treatyClaimed: scn.taxSettings.treatyClaimed, votingPctOfPayer: holder?.pctVotesDeemed ?? 0, fee: r.fee, revenueShare: r.revenueShare, participating: r.loan?.participating, ...extra } as Parameters<typeof canadianWithholding>[4];
  };

  const withhold = (kind: PaymentKind, gross: number, payerId: string, recipientId: string, ctx: Parameters<typeof canadianWithholding>[4]) => {
    const payer = ents.get(payerId);
    const recipient = ents.get(recipientId);
    if (!payer || !recipient) return undefined;
    return canadianWithholding(kind, gross, payer, recipient, ctx);
  };

  // Track retained earnings & cash by entity across years
  const reBalance: Record<string, number> = Object.fromEntries(scn.entities.map((e) => [e.id, 0]));
  const lossPool: Record<string, number> = Object.fromEntries(scn.entities.map((e) => [e.id, 0]));
  const usNol: Record<string, number> = Object.fromEntries(scn.entities.map((e) => [e.id, 0]));
  const cash: Record<string, number> = Object.fromEntries(scn.entities.map((e) => [e.id, toCad(e.openingCash ?? 0, e.currency, years[0])]));
  const unpaidPref: Record<string, number> = {};

  // Process entities in a fixed order: Canadian entities, then U.S. venture, then investor/others.
  const order = [...scn.entities].sort((a, b) => rank(a) - rank(b));
  function rank(e: EntityNode) {
    if (e.id === op) return 0;
    if (e.jurisdiction === 'CA' && e.kind !== 'individual') return 1;
    if (e.id === txg) return 2;
    if (e.kind === 'investor') return 4;
    return 3;
  }

  for (const y of years) {
    const flowsOfYear = () => flows.filter((f) => f.year === y);
    // 1) Capital flows (equity, loans, contributions, grants/donations, restricted funding)
    for (const r of scn.relationships) {
      const amtCad = toCad(r.amount, r.currency, y, r);
      if (r.startYear === y && amtCad) {
        const k: FlowKind | null =
          r.type === 'common-shares' ? 'equity' : r.type === 'preferred-shares' ? 'preferred-equity' : r.type === 'intercompany-loan' || r.type === 'third-party-loan' ? 'loan-drawdown' : r.type === 'convertible' ? 'convertible' : r.type === 'capital-contribution' ? 'capital-contribution' : null;
        if (k) {
          pushFlow({ year: y, month: 1, from: r.from, to: r.to, kind: k, gross: amtCad, withholding: 0, relId: r.id, capital: true, status: r.evidence, legalBasis: legalFor(r), accounting: k === 'loan-drawdown' || k === 'convertible' ? 'Liability of the borrower; receivable of the lender.' : 'Share capital / contributed surplus of the recipient; investment of the investor.', taxTreatment: 'Not income. Creates tax attributes (paid-up capital, cost base, or debt principal).', explanation: explainCapital(r, ents), sources: sourcesFor(r) });
          ey(r.to, y).capitalIn += amtCad;
          ey(r.from, y).capitalOut += amtCad;
          if (k === 'equity' || k === 'preferred-equity' || k === 'capital-contribution') ey(r.to, y).equityContributed += amtCad;
        }
      }
      if (r.type === 'grant' || r.type === 'donation' || r.type === 'restricted-funding') {
        const amt = r.annual ? toCad(r.annual[y] ?? 0, r.currency, y, r) : r.startYear === y ? amtCad : 0;
        if (amt) {
          pushFlow({ year: y, month: 4, from: r.from, to: r.to, kind: r.type === 'donation' ? 'donation' : r.type === 'grant' ? 'grant' : 'restricted-funding', gross: amt, withholding: 0, relId: r.id, capital: false, status: r.evidence, legalBasis: legalFor(r), accounting: r.grant?.restricted || r.type === 'restricted-funding' ? 'Restricted contribution — deferred and recognised as the restricted spending occurs.' : 'Contribution revenue of the recipient; expense of the payer.', taxTreatment: r.type === 'donation' ? 'A gift is deductible/creditable only if made to a qualified donee with an official receipt; the Foundation is not shown as a registered charity.' : 'Grant income of the recipient; deductibility for a commercial payer depends on business purpose.', explanation: `${ents.get(r.from)?.name ?? r.from} provides ${r.type.replace('-', ' ')} to ${ents.get(r.to)?.name ?? r.to}.`, sources: sourcesFor(r) });
          ey(r.to, y).grantsReceived += amt;
          ey(r.from, y).grantsPaid += amt;
        }
      }
    }

    // 2) Interest and principal
    for (const r of [...loanRels, ...convRels]) {
      const sched = loans[r.id].find((l) => l.year === y);
      if (!sched) continue;
      const cur = r.currency;
      const interest = toCad(sched.interestPaid, cur, y, r);
      const principal = toCad(sched.principal, cur, y, r);
      const accrued = toCad(sched.interestAccrued, cur, y, r);
      const intExp = interest + accrued;
      if (intExp) {
        ey(r.to, y).interestExpense += intExp;
        ey(r.from, y).interestIncome += intExp;
      }
      if (interest) {
        const w = withhold('interest', interest, r.to, r.from, wctx({ ...r, from: r.to, to: r.from }, y, { participating: r.loan?.participating }));
        pushFlow({ year: y, month: 12, from: r.to, to: r.from, kind: 'interest', gross: interest, withholding: w?.amount ?? 0, relId: r.id, capital: false, status: r.evidence, legalBasis: legalFor(r), accounting: 'Interest expense of the borrower; interest income of the lender.', taxTreatment: w?.basis ?? 'Interest is generally deductible to the borrower (s. 20(1)(c)) subject to thin-cap, EIFEL and transfer pricing.', explanation: `Interest on the ${r.type.replace('-', ' ')} at ${(((r.loan?.rate ?? r.convertible?.rate) ?? 0) * 100).toFixed(2)}%.`, sources: [...sourcesFor(r), ...(w?.sources ?? [])], withholdingDetail: w });
      }
      if (principal) {
        pushFlow({ year: y, month: 12, from: r.to, to: r.from, kind: 'principal', gross: principal, withholding: 0, relId: r.id, capital: true, status: r.evidence, legalBasis: legalFor(r), accounting: 'Reduces the loan liability and receivable.', taxTreatment: 'Not income; return of principal.', explanation: 'Repayment of loan principal.', sources: sourcesFor(r) });
        ey(r.to, y).capitalOut += principal;
        ey(r.from, y).capitalIn += principal;
      }
      ey(r.to, y).debtOutstanding += toCad(sched.closing, cur, y, r);
    }

    // 3) Fees, licences, revenue share, service agreements, guarantees
    for (const r of scn.relationships.filter((x) => ['management-agreement', 'license', 'revenue-share', 'jv', 'service-agreement', 'guarantee', 'sponsorship', 'vendor', 'hosting'].includes(x.type))) {
      if (y < r.startYear) continue;
      // Convention: for service/rights relationships `from` is the provider and `to` is the client who pays.
      // Sponsorship is a money relationship: the sponsor (`from`) pays the operator (`to`).
      const payer = r.type === 'sponsorship' ? r.from : r.to;
      const recipient = payer === r.from ? r.to : r.from;
      const pRow = ey(payer, y);
      const evRev = events.filter((e) => e.operatorId === payer && e.year === y).reduce((a, e) => a + e.revenueTotal, 0);
      const evEbitda = events.filter((e) => e.operatorId === payer && e.year === y).reduce((a, e) => a + e.ebitda, 0);
      let gross = 0;
      if (r.type === 'revenue-share' || r.type === 'jv') {
        const pct = r.revenueShare?.pct ?? 0;
        gross = (r.revenueShare?.base === 'event-revenue' ? evRev : Math.max(0, evEbitda)) * pct;
      } else if (r.type === 'guarantee') {
        gross = toCad(r.amount, r.currency, y, r) * (r.guaranteeFeePct ?? 0);
      } else if (r.fee?.basis === 'pct-revenue') gross = evRev * (r.fee.pct ?? 0);
      else if (r.fee?.basis === 'pct-ebitda') gross = Math.max(0, evEbitda) * (r.fee.pct ?? 0);
      else if (r.annual) gross = toCad(r.annual[y] ?? 0, r.currency, y, r);
      else if (r.fee?.amountPerYear) gross = toCad(r.fee.amountPerYear[y] ?? 0, r.currency, y, r);
      if (!gross) continue;
      if (['sponsorship', 'vendor', 'hosting'].includes(r.type) && !r.annual) continue; // descriptive only
      const kind: PaymentKind = r.type === 'license' ? 'royalty' : r.type === 'management-agreement' ? 'management-fee' : r.type === 'revenue-share' || r.type === 'jv' ? 'revenue-share' : 'service-fee';
      const w = withhold(kind, gross, payer, recipient, wctx({ ...r, from: payer, to: recipient }, y));
      const fk: FlowKind = kind === 'royalty' ? 'royalty' : kind === 'management-fee' ? 'management-fee' : kind === 'revenue-share' ? 'revenue-share' : r.type === 'guarantee' ? 'guarantee-fee' : 'service-fee';
      pushFlow({ year: y, month: 12, from: payer, to: recipient, kind: fk, gross, withholding: w && w.amount !== null ? w.amount : 0, relId: r.id, capital: false, status: r.evidence, legalBasis: legalFor(r), accounting: 'Expense of the payer; revenue of the recipient. Eliminated in group economics when both are in the group.', taxTreatment: w?.basis ?? 'Deductible if reasonable and incurred to earn income; taxable to the recipient.', explanation: explainFee(r, ents, gross), sources: [...sourcesFor(r), ...(w?.sources ?? [])], withholdingDetail: w });
      const rRow = ey(recipient, y);
      if (kind === 'royalty') {
        pRow.royaltiesPaid += gross;
        rRow.royaltiesReceived += gross;
      } else if (kind === 'management-fee') {
        pRow.feesPaid += gross;
        rRow.feesReceived += gross;
      } else if (kind === 'revenue-share') {
        pRow.revSharePaid += gross;
        rRow.revShareReceived += gross;
      } else {
        pRow.servicesPaid += gross;
        rRow.servicesReceived += gross;
      }
      if ((r.type === 'management-agreement' || r.type === 'license' || r.type === 'service-agreement') && !r.fee?.documentedFmv && inGroup(payer) && inGroup(recipient)) {
        issues.push({ id: `fee-doc-${r.id}`, severity: 'warning', area: 'tax-ca', title: `${r.label ?? r.type} lacks fair-market-value support`, plain: `${ents.get(payer)?.name} pays ${ents.get(recipient)?.name} ${fmt(gross)} in ${y}. Without a written agreement and evidence that the price is what unrelated parties would charge, tax authorities can deny the deduction or adjust the price.`, sources: [S('ita-247-2', 'ITA s. 247(2)'), S('irc-482', '26 U.S.C. § 482'), S('tr-ix', 'Convention Art. IX')], resolution: 'Prepare an intercompany agreement and a transfer-pricing analysis (benchmarking) before any fee is charged.', professional: true });
        if (scn.taxSettings.disallowUndocumentedFees) pRow.nonDeductibleFees += gross;
      }
      if (kind === 'revenue-share') {
        const ch = r.revenueShare?.characterization;
        issues.push({ id: `revshare-${r.id}`, severity: 'warning', area: 'tax-ca', title: 'Revenue-share / joint-venture characterisation unresolved', plain: `The payment from ${ents.get(payer)?.name} to ${ents.get(recipient)?.name} is computed as a share of event ${r.revenueShare?.base === 'event-revenue' ? 'revenue' : 'profit'}. Depending on the contract, Canada could treat it as a partnership share (taxed as Canadian business profits of the U.S. party), a royalty-like payment subject to withholding, or U.S. business profits with no Canadian tax. Model setting: ${ch}.`, sources: [S('tr-vii', 'Convention Art. VII'), S('ita-212-1', 'ITA s. 212(1)(d)'), S('tr-v', 'Convention Art. V')], resolution: 'Obtain a legal opinion on whether the arrangement creates a partnership or a permanent establishment before signing.', professional: true });
        if (ch === 'partnership-pe') {
          // Canadian branch: Part I tax on the share at general rates + branch tax 5% (Art. X(6)) above $500k cumulative exemption (simplified annual).
          const caRate = 0.15 + 0.115;
          const part1 = gross * caRate;
          const branch = Math.max(0, gross - part1 - 500_000 / years.length) * 0.05;
          rRow.canadianBranchTax += part1 + branch;
        }
      }
    }

    // 4) Canadian corporate tax (and thin cap, EIFEL)
    for (const e of order.filter((x) => x.jurisdiction === 'CA' && (x.kind === 'ca-corp' || x.kind === 'ca-nfp'))) {
      const row = ey(e.id, y);
      // Thin cap for loans from specified non-resident shareholders
      let nonDed = 0;
      for (const r of [...loanRels, ...convRels].filter((r) => r.to === e.id)) {
        const s = loans[r.id].find((l) => l.year === y);
        if (!s) continue;
        const lender = ents.get(r.from);
        if (!lender || lender.tax.residence === 'CA') continue;
        if (!isSpecifiedNonResidentShareholder(control, r.from, scn)) continue;
        const puc = equityRels.filter((q) => q.from === r.from && q.to === e.id && q.startYear <= y).reduce((a, q) => a + toCad(q.amount, q.currency, q.startYear, q), 0);
        const contrib = scn.relationships.filter((q) => q.type === 'capital-contribution' && q.from === r.from && q.to === e.id && q.startYear <= y).reduce((a, q) => a + toCad(q.amount, q.currency, q.startYear, q), 0);
        const tc = thinCap({ averageDebtToSpecifiedNR: toCad(s.averageBalance, r.currency, y, r), retainedEarningsStart: reBalance[e.id], contributedSurplusFromSNR: contrib, pucOfSNRShares: puc, interestToSNR: toCad(s.interest, r.currency, y, r) }, y);
        if (tc.disallowedInterest > 0) {
          nonDed += tc.disallowedInterest;
          const w = withhold('deemed-dividend', tc.disallowedInterest, e.id, r.from, wctx({ ...r, from: e.id, to: r.from }, y));
          // Reclassify part of the interest withholding as dividend withholding
          const intFlow = flows.find((f) => f.relId === r.id && f.kind === 'interest' && f.year === y);
          if (intFlow && w) {
            const extra = (w.amount ?? 0) - (intFlow.withholdingDetail?.appliedRate ?? 0) * tc.disallowedInterest;
            intFlow.withholding += Math.max(0, extra);
            intFlow.net = intFlow.gross - intFlow.withholding;
            intFlow.taxTreatment += ` Thin capitalization: ${fmt(tc.disallowedInterest)} of this interest is non-deductible and deemed a dividend for withholding (s. 214(16)).`;
          }
          issues.push({ id: `thincap-${r.id}-${y}`, severity: 'warning', area: 'tax-ca', title: `Thin capitalization limits interest deductions (${y})`, plain: `${e.name} owes ${fmt(toCad(s.averageBalance, r.currency, y, r))} on average to ${lender.name}, a significant non-resident shareholder. Canada only allows interest on debt up to 1.5 times the shareholder’s equity amount (${fmt(tc.equityAmount)}). About ${fmt(tc.disallowedInterest)} of interest cannot be deducted and is treated as a dividend for withholding.`, sources: [S('ita-18-4', 'ITA s. 18(4)'), S('ita-18-5-defs', 'ITA s. 18(5)'), S('ita-214-16', 'ITA s. 214(16)')], resolution: 'Reduce the shareholder loan relative to equity, or increase equity, and confirm the equity amount computation with an accountant.', professional: true });
        }
        if (r.loan && r.loan.benchmarkRate === undefined && lender.tax.armsLengthWithOperator !== 'yes') {
          issues.push({ id: `tp-rate-${r.id}`, severity: 'watch', area: 'tax-ca', title: 'Interest rate not benchmarked', plain: `The ${(r.loan.rate * 100).toFixed(2)}% rate on the loan from ${lender.name} has no documented arm’s-length benchmark. If the rate is higher than unrelated lenders would charge, Canada can reduce the deduction.`, sources: [S('ita-247-2', 'ITA s. 247(2)'), S('tr-xi-5p', 'Convention Art. XI(5)')], resolution: 'Document an arm’s-length interest rate (credit rating, comparable loans).', professional: true });
        }
        if (r.loan?.benchmarkRate !== undefined && r.loan.rate > r.loan.benchmarkRate) {
          const excess = toCad(s.averageBalance, r.currency, y, r) * (r.loan.rate - r.loan.benchmarkRate);
          nonDed += excess;
          issues.push({ id: `tp-${r.id}-${y}`, severity: 'warning', area: 'tax-ca', title: 'Interest above documented arm’s-length rate', plain: `Interest above the ${(r.loan.benchmarkRate * 100).toFixed(2)}% benchmark (about ${fmt(excess)}) is treated as non-deductible in this model.`, sources: [S('ita-247-2', 'ITA s. 247(2)')], resolution: 'Align the rate with the benchmark.', professional: true });
        }
      }

      const netInterest = row.interestExpense - row.interestIncome;
      const ccpcThis = e.id === op ? ccpcEligible : false;
      const ei = eifel({ year: y, ccpc: e.id === op ? ccpcAuto : false, associatedTaxableCapital: e.tax.associatedTaxableCapital ?? 0, groupNetInterest: Math.max(0, netInterest), netInterest: Math.max(0, netInterest - nonDed), ebitdaProxy: row.ebitda });
      nonDed += ei.disallowed;
      row.nonDeductibleInterest = nonDed;

      const income = row.ebitda + row.interestIncome - (row.interestExpense - nonDed) - (row.feesPaid - row.nonDeductibleFees) + row.feesReceived - row.royaltiesPaid + row.royaltiesReceived - row.revSharePaid + row.revShareReceived - row.servicesPaid + row.servicesReceived + row.grantsReceived - row.grantsPaid - row.ccaProxy;
      // nonDeductibleFees applies to all undocumented intercompany fee types when the risk case is selected
      row.incomeBeforeTax = income;
      if (e.kind === 'ca-nfp') {
        row.incomeTax = 0;
      } else {
        const t = canadianCorporateTax({ year: y, incomeBeforeLosses: income, activeBusinessIncome: Math.max(0, income), lossPoolOpening: lossPool[e.id], ccpcEligible: ccpcThis, businessLimitShare: e.tax.businessLimitShare ?? 1, associatedTaxableCapital: e.tax.associatedTaxableCapital ?? 0, aaii: e.tax.aaii ?? 0 });
        lossPool[e.id] = t.lossPoolClosing;
        row.caTax = t;
        row.incomeTax = t.totalTax;
        if (t.totalTax) pushFlow({ year: y, month: 12, from: e.id, to: 'gov-ca', kind: 'tax', gross: t.totalTax, withholding: 0, capital: false, status: 'legislation', legalBasis: 'Income Tax Act Part I; Ontario Taxation Act, 2007', accounting: 'Income tax expense', taxTreatment: 'Corporate income tax.', explanation: `${e.name} pays federal and Ontario corporate income tax on ${fmt(t.taxableIncome)} of taxable income.`, sources: t.sources });
      }
      row.netIncome = row.incomeBeforeTax - row.incomeTax - (row.nonDeductibleInterest ? 0 : 0);
    }

    // 5) Dividends from Canadian corporations to shareholders
    for (const e of order.filter((x) => x.jurisdiction === 'CA' && x.kind === 'ca-corp')) {
      const row = ey(e.id, y);
      const holders = equityRels.filter((r) => r.to === e.id && r.startYear <= y);
      if (!holders.length) continue;
      const totalShares = holders.reduce((a, r) => a + (r.equity?.shares ?? 0), 0);
      // Cash available before dividends
      const yFlows = flowsOfYear();
      const cashBefore = cash[e.id] + sum(yFlows.filter((f) => f.to === e.id).map((f) => f.net)) - sum(yFlows.filter((f) => f.from === e.id).map((f) => f.gross));
      const retained = reBalance[e.id] + row.netIncome;
      let distributable = Math.max(0, Math.min(retained, cashBefore));
      // Preferred first
      for (const r of holders.filter((h) => h.type === 'preferred-shares' && h.equity?.prefRate)) {
        const sub = toCad(r.amount, r.currency, r.startYear, r);
        const due = sub * (r.equity!.prefRate ?? 0) + (r.equity!.prefCumulative ? unpaidPref[r.id] ?? 0 : 0);
        const paid = Math.min(due, distributable);
        unpaidPref[r.id] = r.equity!.prefCumulative ? due - paid : 0;
        distributable -= paid;
        if (paid > 0) payDividend(e, r, paid, y);
      }
      // Common: payout policy
      const commons = holders.filter((h) => h.type === 'common-shares');
      const policy = commons[0]?.equity?.payoutRatio ?? scn.assumptions.defaultPayout;
      const pool = Math.max(0, Math.min(distributable, Math.max(0, row.netIncome)) * policy);
      const commonShares = commons.reduce((a, r) => a + (r.equity?.shares ?? 0), 0);
      for (const r of commons) {
        const amt = commonShares ? (pool * (r.equity?.shares ?? 0)) / commonShares : 0;
        if (amt > 0) payDividend(e, r, amt, y);
      }
      void totalShares;
    }

    function payDividend(e: EntityNode, r: Relationship, amt: number, year: number) {
      const w = withhold('dividend', amt, e.id, r.from, wctx({ ...r, from: e.id, to: r.from }, year));
      pushFlow({ year, month: 12, from: e.id, to: r.from, kind: 'dividend', gross: amt, withholding: w?.amount ?? 0, relId: r.id, capital: false, status: 'assumption', legalBasis: `Dividend declared on ${r.equity?.classLabel ?? 'shares'} (directors’ resolution required; solvency tests under CBCA s. 42)`, accounting: 'Reduces retained earnings of the payer; dividend income of the shareholder.', taxTreatment: w?.basis ?? 'Taxable dividend; not deductible to the payer.', explanation: `${e.name} pays a dividend of ${fmt(amt)} to ${ents.get(r.from)?.name}.`, sources: [...sourcesFor(r), ...(w?.sources ?? [])], withholdingDetail: w });
      ey(e.id, year).dividendsPaid += amt;
      ey(r.from, year).dividendsReceived += amt;
    }

    // 6) U.S. venture taxes
    for (const e of order.filter((x) => x.jurisdiction === 'US' && (x.kind === 'us-llc'))) {
      const row = ey(e.id, y);
      const rate = fx[y];
      const recv = flowsOfYear().filter((f) => f.to === e.id && !f.capital);
      const item = (k: UsIncomeItem['kind'], fk: FlowKind[], f245 = false): UsIncomeItem => {
        const fs = recv.filter((f) => fk.includes(f.kind));
        const gross = sum(fs.map((f) => f.gross)) / rate;
        const ft = sum(fs.filter((f) => f.withholdingDetail?.permanence === 'final').map((f) => f.withholding)) / rate;
        const inCanadaShare = fs.length ? (scn.relationships.find((r) => r.id === fs[0].relId)?.fee?.servicesInCanadaPct ?? 1) : 1;
        return { kind: k, grossUsd: gross, foreignTaxUsd: ft, foreignSourcePct: k === 'fee' ? inCanadaShare : 1, dividend245A: f245 };
      };
      const holdsTenPct = control.holders.find((h) => h.holderId === e.id)?.pctVotesDeemed ?? 0;
      const items: UsIncomeItem[] = [
        item('interest', ['interest']),
        item('dividend', ['dividend', 'deemed-dividend'], holdsTenPct >= 0.1),
        item('fee', ['management-fee', 'service-fee', 'guarantee-fee']),
        item('royalty', ['royalty']),
        item('revenue-share', ['revenue-share']),
      ].filter((x) => x.grossUsd);
      row.withholdingSuffered = sum(recv.filter((f) => f.withholdingDetail?.permanence === 'final').map((f) => f.withholding));
      row.withholdingRecoverable = sum(recv.filter((f) => f.withholdingDetail?.permanence === 'refundable').map((f) => f.withholding));
      // Deductions: overhead, interest paid (e.g., to the investor), grants and services paid
      const deductionsUsd = (row.overhead + row.interestExpense + row.grantsPaid + row.servicesPaid + row.feesPaid + row.royaltiesPaid) / rate;
      const input = { year: y, entity: e, items, deductionsUsd, nolOpeningUsd: usNol[e.id], canadianIncomeTaxUsd: row.canadianBranchTax / rate };
      const t = usTax(input, scn.assumptions.usUnknownAs);
      const alt = usTax(input, scn.assumptions.usUnknownAs === 'corporation' ? 'pass-through' : 'corporation');
      usNol[e.id] = t.nolClosing;
      row.usTax = t;
      row.usTaxAlt = e.tax.usClassification === 'unknown' || !e.tax.usClassification ? alt : undefined;
      row.incomeBeforeTax = (sum(items.map((x) => x.grossUsd)) - deductionsUsd) * rate;
      row.incomeTax = t.totalUsTax * rate + row.canadianBranchTax;
      row.netIncome = row.incomeBeforeTax - row.incomeTax - row.withholdingSuffered;
      if (t.totalUsTax) pushFlow({ year: y, month: 12, from: e.id, to: t.classification === 'corporation' ? 'gov-us' : 'gov-us-members', kind: 'tax', gross: t.totalUsTax * rate, withholding: 0, capital: false, status: t.conditional ? 'assumption' : 'legislation', legalBasis: t.classification === 'corporation' ? 'Internal Revenue Code § 11; NY Tax Law Article 9-A' : 'Member-level income tax (pass-through)', accounting: t.classification === 'corporation' ? 'Income tax expense' : 'Not an entity expense — borne by members', taxTreatment: 'U.S. income tax after foreign tax credits.', explanation: t.classification === 'corporation' ? `${e.name} pays U.S. federal and New York tax.` : `${e.name}'s members pay U.S. tax on their share of its income.`, sources: t.sources });
      if (row.canadianBranchTax) pushFlow({ year: y, month: 12, from: e.id, to: 'gov-ca', kind: 'tax', gross: row.canadianBranchTax, withholding: 0, capital: false, status: 'assumption', legalBasis: 'ITA Part I and Part XIV branch tax (treaty Art. X(6))', accounting: 'Income tax expense', taxTreatment: 'Canadian tax on business profits attributable to a Canadian PE.', explanation: 'Canadian tax on the partnership/JV share if the U.S. party is treated as carrying on business in Canada.', sources: [S('tr-x', 'Convention Art. X(6)'), S('tr-vii', 'Convention Art. VII')] });
    }

    // 7) Investor flows (PE ↔ TXG)
    // (handled after loop for exit; annual distributions here)
    {
      const inv = scn.investor;
      const peId = scn.roles.investor;
      const row = ey(txg, y);
      const peRel = scn.relationships.find((r) => r.from === peId && r.to === txg);
      const invested = peRel && peRel.startYear <= y;
      if (invested && txg) {
        if (inv.instrument === 'loan') {
          // Interest and principal on an investor loan come from the relationship's loan schedule (step 2).
        } else {
          // distributions
          const yFlows = flowsOfYear();
          const avail = cash[txg] + sum(yFlows.filter((f) => f.to === txg).map((f) => f.net)) - sum(yFlows.filter((f) => f.from === txg).map((f) => f.gross));
          const dist = Math.max(0, Math.min(avail, Math.max(0, row.netIncome))) * inv.distributionPolicy * inv.ownershipPct;
          if (dist > 0 && y < inv.exitYear) {
            pushFlow({ year: y, month: 12, from: txg, to: peId, kind: 'distribution', gross: dist, withholding: 0, capital: false, status: 'assumption', legalBasis: 'LLC operating agreement / distribution policy', accounting: 'Distribution to members (equity)', taxTreatment: inv.instrument === 'preferred' ? 'Preferred return distribution.' : 'Distribution; taxation depends on LLC classification.', explanation: `Three X Global distributes ${fmt(dist)} to the investor (${(inv.ownershipPct * 100).toFixed(0)}% share of the distributed amount).`, sources: [] });
          }
        }
      }
    }

    // 8) Cash and retained earnings roll-forward for all entities
    const yFlows = flowsOfYear();
    for (const e of scn.entities) {
      const row = ey(e.id, y);
      row.openingCash = cash[e.id];
      row.cashIn = sum(yFlows.filter((f) => f.to === e.id).map((f) => f.net));
      row.cashOut = sum(yFlows.filter((f) => f.from === e.id).map((f) => f.gross));
      cash[e.id] = row.openingCash + row.cashIn - row.cashOut;
      row.closingCash = cash[e.id];
      if (e.jurisdiction === 'CA' || e.id === txg) {
        reBalance[e.id] += row.netIncome - row.dividendsPaid;
        row.retainedEarnings = reBalance[e.id];
      }
    }
  }

  // ---------- Exit and investor returns ----------
  const inv = scn.investor;
  const exitYear = years.includes(inv.exitYear) ? inv.exitYear : years[years.length - 1];
  const opExit = ey(op, exitYear);
  const opDebt = opExit.debtOutstanding;
  const opEv = Math.max(0, opExit.ebitda) * inv.exitMultiple;
  const opEquityValue = Math.max(0, opEv - opDebt + opExit.closingCash);
  const exitBreakdown: { label: string; amount: number }[] = [];
  // TXG holdings in operator
  const opShares = equityRels.filter((r) => r.to === op);
  const totalOpShares = sum(opShares.map((r) => r.equity?.shares ?? 0));
  const txgOpShares = sum(opShares.filter((r) => r.from === txg).map((r) => r.equity?.shares ?? 0));
  const txgStakeValue = totalOpShares ? (opEquityValue * txgOpShares) / totalOpShares : 0;
  const txgLoanRecv = sum([...loanRels, ...convRels].filter((r) => r.from === txg).map((r) => toCad(loans[r.id].find((l) => l.year === exitYear)?.closing ?? 0, r.currency, exitYear, r)));
  const txgContract = sum(flows.filter((f) => f.to === txg && f.year === exitYear && (f.kind === 'revenue-share' || f.kind === 'royalty' || f.kind === 'management-fee')).map((f) => f.net)) * Math.min(3, inv.exitMultiple);
  const txgCash = ey(txg, exitYear).closingCash;
  const txgCost = sum(opShares.filter((r) => r.from === txg).map((r) => toCad(r.amount, r.currency, r.startYear, r)));
  const gain = Math.max(0, txgStakeValue - txgCost);
  const txgEnt = ents.get(txg);
  // Corporate: 21% federal + NY on apportioned gain. Pass-through: assumed 23.8% long-term capital gains rate for individual members (20% + 3.8% NIIT) — an assumption.
  const exitTaxRate = txgEnt?.tax.usClassification === 'corporation' ? 0.21 + (txgEnt.tax.nyApportionment ?? 0) * 0.065 : 0.238 * (txgEnt?.tax.memberUsResidentShare ?? 1);
  const exitTax = gain * exitTaxRate;
  exitBreakdown.push({ label: 'Operator equity value (EBITDA × multiple − debt + cash)', amount: opEquityValue });
  exitBreakdown.push({ label: 'Three X Global share of operator equity', amount: txgStakeValue });
  exitBreakdown.push({ label: 'Outstanding loans receivable from Canada', amount: txgLoanRecv });
  exitBreakdown.push({ label: 'Value of contractual income streams (capped at 3× final-year receipts)', amount: txgContract });
  exitBreakdown.push({ label: 'Three X Global cash', amount: txgCash });
  exitBreakdown.push({ label: 'Less: U.S. tax on gain on operator shares (illustrative)', amount: -exitTax });
  let txgExitValue = inv.exitMethod === 'fixed-value' && inv.exitValueUsd ? inv.exitValueUsd * fx[exitYear] : txgStakeValue + txgLoanRecv + txgContract + txgCash - exitTax;
  txgExitValue = Math.max(0, txgExitValue);

  // Investor (PE) flows
  const peId = scn.roles.investor;
  const peRel = scn.relationships.find((r) => r.from === peId && r.to === txg);
  const peFlowsByYear: Record<number, number> = Object.fromEntries(years.map((y) => [y, 0]));
  const peLabels: { year: number; amount: number; label: string }[] = [];
  let invested = 0;
  let distributions = 0;
  for (const f of flows.filter((f) => f.from === peId && f.to === txg && f.capital)) {
    peFlowsByYear[f.year] -= f.gross;
    invested += f.gross;
    peLabels.push({ year: f.year, amount: -f.gross, label: 'Investment' });
  }
  for (const f of flows.filter((f) => f.from === txg && f.to === peId)) {
    peFlowsByYear[f.year] += f.net;
    distributions += f.net;
    peLabels.push({ year: f.year, amount: f.net, label: f.kind === 'interest' ? 'Interest' : 'Distribution' });
  }
  let exitProceeds = 0;
  let wf: ReturnType<typeof waterfall> | undefined;
  if (peRel) {
    const inYears = years.filter((y) => y >= peRel.startYear && y <= exitYear).length;
    if (inv.instrument === 'loan') {
      const sched = loans[peRel.id]?.find((l) => l.year === exitYear);
      exitProceeds = Math.min(txgExitValue, toCad(sched?.closing ?? 0, peRel.currency, exitYear, peRel));
    } else {
      const prefCap = inv.instrument === 'preferred' ? toCad(peRel.amount, peRel.currency, peRel.startYear, peRel) : 0;
      wf = waterfall({ proceeds: txgExitValue, prefCapital: prefCap, prefRate: inv.prefRate, years: inYears, cumulative: true, prefPaid: distributions, participating: false, residualPct: inv.ownershipPct });
      exitProceeds = inv.instrument === 'preferred' ? wf.toPreferred : txgExitValue * inv.ownershipPct;
    }
    peFlowsByYear[exitYear] += exitProceeds;
    peLabels.push({ year: exitYear, amount: exitProceeds, label: 'Exit proceeds' });
  }
  const peSeries = years.filter((y) => y <= exitYear).map((y) => peFlowsByYear[y]);
  // After-tax view: distributions/interest taxed in full at the investor rate; exit proceeds taxed on the gain over the amount invested.
  const yrs = years.filter((y) => y <= exitYear);
  const afterTax = yrs.map((y, i) => {
    const income = sum(peLabels.filter((l) => l.year === y && (l.label === 'Interest' || l.label === 'Distribution')).map((l) => l.amount));
    const exit = sum(peLabels.filter((l) => l.year === y && l.label === 'Exit proceeds').map((l) => l.amount));
    const tax = income * scn.investor.investorTaxRate + Math.max(0, exit - invested) * scn.investor.investorTaxRate;
    return peSeries[i] - tax;
  });
  const investor: InvestorResult = {
    flows: peLabels,
    flowsAfterTax: years.filter((y) => y <= exitYear).map((y, i) => ({ year: y, amount: afterTax[i] })),
    irr: irr(peSeries),
    irrAfterTax: irr(afterTax),
    moic: moic(peSeries),
    invested,
    distributions,
    exitProceeds,
    exitBreakdown,
    waterfall: wf,
  };

  // TXG's own Canadian investment returns
  const txgSeriesByYear: Record<number, number> = Object.fromEntries(years.map((y) => [y, 0]));
  for (const f of flows.filter((f) => f.from === txg && ents.get(f.to)?.jurisdiction === 'CA' && f.capital)) txgSeriesByYear[f.year] -= f.gross;
  for (const f of flows.filter((f) => f.to === txg && ents.get(f.from)?.jurisdiction === 'CA')) txgSeriesByYear[f.year] += f.net;
  txgSeriesByYear[exitYear] += txgStakeValue + txgLoanRecv + txgContract - exitTax;
  const txgSeries = years.filter((y) => y <= exitYear).map((y) => txgSeriesByYear[y]);
  const txgReturns: InvestorResult = {
    flows: years.map((y) => ({ year: y, amount: txgSeriesByYear[y], label: 'Net cash with Canada' })),
    flowsAfterTax: [],
    irr: irr(txgSeries),
    irrAfterTax: null,
    moic: moic(txgSeries),
    invested: -sum(txgSeries.filter((x) => x < 0)),
    distributions: sum(flows.filter((f) => f.to === txg && ents.get(f.from)?.jurisdiction === 'CA' && !f.capital).map((f) => f.net)),
    exitProceeds: txgStakeValue + txgLoanRecv + txgContract - exitTax,
    exitBreakdown,
  };

  // ---------- NFP ----------
  const nfp = analyzeNfp(scn, flows, years);
  issues.push(...nfp.issues);

  // ---------- Group economics ----------
  const groupIds = scn.entities.filter((e) => e.inGroup).map((e) => e.id);
  const externalRevenue = sum(events.map((e) => e.revenueTotal));
  const externalCosts = sum(events.map((e) => e.costTotal)) + sum(groupIds.flatMap((id) => EY[id].map((r) => r.overhead + r.eht + r.ccaProxy)));
  const eliminated = sum(flows.filter((f) => f.internal && !f.capital && f.kind !== 'tax').map((f) => f.gross));
  const caTax = sum(groupIds.flatMap((id) => EY[id].map((r) => (r.caTax?.totalTax ?? 0) + r.canadianBranchTax)));
  const whFinal = sum(flows.filter((f) => f.withholdingDetail?.permanence === 'final').map((f) => f.withholding));
  const whRec = sum(flows.filter((f) => f.withholdingDetail?.permanence === 'refundable').map((f) => f.withholding));
  const usT = sum(groupIds.flatMap((id) => EY[id].map((r) => (r.usTax ? r.usTax.totalUsTax * fx[r.year] : 0))));
  const externalInterest = sum(flows.filter((f) => f.kind === 'interest' && groupIds.includes(f.from) && !groupIds.includes(f.to)).map((f) => f.gross));
  const groupPreTax = externalRevenue - externalCosts - externalInterest + sum(flows.filter((f) => (f.kind === 'grant' || f.kind === 'donation' || f.kind === 'restricted-funding') && !groupIds.includes(f.from) && groupIds.includes(f.to)).map((f) => f.gross));
  const totalTax = caTax + whFinal + usT;
  const taxByEntity: Record<string, number> = {};
  for (const id of groupIds) taxByEntity[id] = sum(EY[id].map((r) => (r.caTax?.totalTax ?? 0) + r.canadianBranchTax + (r.usTax ? r.usTax.totalUsTax * fx[r.year] : 0)));
  // withholding is borne economically by the recipient
  for (const f of flows.filter((f) => f.withholdingDetail?.permanence === 'final')) if (taxByEntity[f.to] !== undefined) taxByEntity[f.to] += f.withholding;
  const group: GroupResult = {
    externalRevenue,
    externalCosts,
    groupPreTax,
    canadianCorporateTax: caTax,
    withholdingFinal: whFinal,
    withholdingRecoverable: whRec,
    usTax: usT,
    totalTax,
    afterTaxValue: groupPreTax - totalTax,
    operatorRetained: EY[op]?.[EY[op].length - 1]?.retainedEarnings ?? 0,
    txgAfterTax: sum((EY[txg] ?? []).map((r) => r.netIncome)),
    eliminated,
    leakageRate: groupPreTax > 0 ? totalTax / groupPreTax : 0,
    taxByEntity,
  };

  // ---------- Monthly cash (monthlyYear) ----------
  const monthly: Record<string, MonthlyRow[]> = {};
  const my = years.includes(scn.monthlyYear) ? scn.monthlyYear : years[0];
  let peak = { entityId: op, year: my, amount: 0, month: null as number | null, selfSustainingMonth: null as number | null };
  for (const id of groupIds) {
    const yf = flows.filter((f) => f.year === my && (f.from === id || f.to === id));
    const months = Array.from({ length: 12 }, () => ({ inflow: 0, outflow: 0, finIn: 0, finOut: 0 }));
    for (const f of yf) {
      const isIn = f.to === id;
      const amt = isIn ? f.net : f.gross;
      const ev = f.eventId ? scn.events.find((e) => e.id === f.eventId) : undefined;
      let weights: number[];
      if (f.kind === 'event-cost' || f.kind === 'payroll') weights = costRamp(ev?.eventMonth ?? f.month);
      else if (f.kind === 'tickets') weights = Array.from({ length: 12 }, (_, i) => (i + 1 <= (ev?.eventMonth ?? f.month) ? (i + 1 >= (ev?.eventMonth ?? f.month) - 4 ? (i + 1 === (ev?.eventMonth ?? f.month) ? 3 : 1) : 0) : 0));
      else if (f.kind === 'overhead') weights = Array(12).fill(1);
      else weights = Array.from({ length: 12 }, (_, i) => (i + 1 === f.month ? 1 : 0));
      const tot = sum(weights) || 1;
      weights.forEach((w, i) => {
        const v = (amt * w) / tot;
        if (isIn) {
          months[i].inflow += v;
          if (f.capital) months[i].finIn += v;
        } else {
          months[i].outflow += v;
          if (f.capital && f.kind !== 'event-cost') months[i].finOut += v;
        }
      });
    }
    let closing = ey(id, my).openingCash;
    let pre = 0;
    let minPre = 0;
    let minMonth: number | null = null;
    const rows: MonthlyRow[] = months.map((m, i) => {
      closing += m.inflow - m.outflow;
      pre += m.inflow - m.finIn - (m.outflow - m.finOut);
      if (pre < minPre) {
        minPre = pre;
        minMonth = i + 1;
      }
      return { month: i + 1, inflow: m.inflow, outflow: m.outflow, net: m.inflow - m.outflow, closing, preFinancingCumulative: pre };
    });
    monthly[id] = rows;
    if (id === op) {
      const selfSust = rows.findIndex((r, i) => i >= (minMonth ?? 12) && r.preFinancingCumulative >= 0);
      peak = { entityId: op, year: my, amount: -minPre, month: minMonth, selfSustainingMonth: selfSust >= 0 ? selfSust + 1 : null };
    }
  }
  // Multi-year cumulative operating cash need of the operator (before financing)
  let cum = 0;
  let worst = 0;
  for (const y of years) {
    const yf = flows.filter((f) => f.year === y && (f.from === op || f.to === op) && !f.capital);
    cum += sum(yf.filter((f) => f.to === op).map((f) => f.net)) - sum(yf.filter((f) => f.from === op).map((f) => f.gross));
    worst = Math.min(worst, cum);
  }

  // ---------- Break-even ----------
  const breakEven = years.map((y) => {
    const evs = events.filter((e) => e.year === y && e.operatorId === op);
    const row = ey(op, y);
    const opGap = Math.max(0, -(sum(evs.map((e) => e.ebitda)) - row.overhead - row.eht));
    const allIn = Math.max(0, -(sum(evs.map((e) => e.ebitda)) - row.overhead - row.eht - row.interestExpense - row.feesPaid - row.royaltiesPaid - row.revSharePaid));
    return { year: y, operatingGap: opGap, allInGap: allIn, eventsGap: sum(evs.map((e) => e.breakEvenGap)) };
  });

  // ---------- Reconciliation ----------
  const checks: ReconCheck[] = [];
  const flowDiff = sum(flows.map((f) => Math.abs(f.gross - f.withholding - f.net)));
  checks.push({ id: 'flow-integrity', label: 'Every payment: gross = net received + tax withheld', diff: flowDiff, ok: flowDiff < 0.01 });
  for (const e of scn.entities.filter((x) => x.inGroup)) {
    const rows = EY[e.id];
    const diff = sum(rows.map((r) => Math.abs(r.openingCash + r.cashIn - r.cashOut - r.closingCash)));
    checks.push({ id: `cash-${e.id}`, label: `${e.name}: opening cash + inflows − outflows = closing cash`, diff, ok: diff < 0.01 });
  }
  // Sources vs uses (operator, whole horizon)
  const opFlows = flows.filter((f) => f.from === op || f.to === op);
  const sources = sum(opFlows.filter((f) => f.to === op).map((f) => f.net));
  const uses = sum(opFlows.filter((f) => f.from === op).map((f) => f.gross));
  const opRows = EY[op] ?? [];
  const cashChange = opRows.length ? opRows[opRows.length - 1].closingCash - opRows[0].openingCash : 0;
  const suDiff = Math.abs(sources - uses - cashChange);
  checks.push({ id: 'sources-uses', label: 'Operator sources − uses = change in cash', diff: suDiff, ok: suDiff < 0.01 });
  // Internal transfers net to zero inside the group (paid by one = received by other + withholding)
  const internal = flows.filter((f) => f.internal);
  const intDiff = Math.abs(sum(internal.map((f) => f.gross)) - sum(internal.map((f) => f.net + f.withholding)));
  checks.push({ id: 'internal-elim', label: 'Internal transfers eliminate (not counted as new profit)', diff: intDiff, ok: intDiff < 0.01 });
  // Event P&L integrity
  const evDiff = sum(events.map((e) => Math.abs(e.revenueTotal - e.costTotal - e.ebitda)));
  checks.push({ id: 'event-pl', label: 'Event revenue − costs = event EBITDA', diff: evDiff, ok: evDiff < 0.01 });
  const negCash = groupIds.filter((id) => EY[id].some((r) => r.closingCash < -0.5));
  for (const id of negCash) {
    issues.push({ id: `neg-cash-${id}`, severity: 'critical', area: 'finance', title: `${ents.get(id)?.name} runs out of cash`, plain: `Closing cash goes below zero in ${EY[id].filter((r) => r.closingCash < 0).map((r) => r.year).join(', ')}. The plan needs more funding, lower costs or different timing.`, sources: [], resolution: 'Increase the investment, add a credit facility, or reduce costs before the shortfall.', professional: false });
  }

  // ---------- Issues from control/tax ----------
  if (control.status !== 'likely-ccpc') {
    issues.push({ id: 'ccpc-status', severity: control.status === 'likely-not-ccpc' ? 'critical' : 'warning', area: 'control', title: control.status === 'likely-not-ccpc' ? 'CCPC status appears lost' : 'CCPC status uncertain', plain: control.statusPlain, sources: [S('ita-125-7-ccpc', 'ITA s. 125(7)'), S('ita-251-5', 'ITA s. 251(5)'), S('ita-256-5.1', 'ITA s. 256(5.1)')], resolution: 'Confirm the share register, share terms and any shareholder agreement; review control with a Canadian tax lawyer.', professional: true });
  }
  if (scn.taxSettings.sbdTreatment === 'assume-eligible' && control.status !== 'likely-ccpc') {
    issues.push({ id: 'sbd-override', severity: 'warning', area: 'tax-ca', title: 'Small business deduction assumed despite control uncertainty', plain: 'You chose to assume the small business deduction even though the control analysis does not confirm CCPC status. Results may understate Canadian tax.', sources: [S('ita-125-1', 'ITA s. 125(1)')], resolution: 'Switch the setting to "auto" once facts are confirmed.', professional: true });
  }
  const txgE = ents.get(txg);
  if (txgE && (!txgE.tax.usClassification || txgE.tax.usClassification === 'unknown')) {
    issues.push({ id: 'llc-class', severity: 'critical', area: 'tax-us', title: `U.S. tax classification of ${txgE?.name ?? 'the U.S. LLC'} not confirmed`, plain: 'An LLC can be ignored for tax, taxed as a partnership, or taxed as a corporation (by election). This changes who pays U.S. tax, whether treaty benefits are available, and the Canadian withholding rate on dividends. The model shows both a corporate and a pass-through view.', sources: [S('cfr-301.7701-3', 'Treas. Reg. § 301.7701-3'), S('tr-iv-6-7', 'Convention Art. IV(6)-(7)')], resolution: 'Obtain the LLC’s operating agreement, the IRS EIN confirmation (CP575) and any Form 8832 election, and the members’ identities and residence.', professional: true });
  }
  if (txgE && txgE.tax.lobQualifying !== 'yes' && flows.some((f) => f.to === txg && f.withholdingDetail?.treatyRate !== null && (f.withholdingDetail?.treatyRate ?? 1) < (f.withholdingDetail?.domesticRate ?? 0))) {
    issues.push({ id: 'lob', severity: 'warning', area: 'withholding', title: 'Treaty benefits depend on the limitation-on-benefits test', plain: 'Lower treaty withholding rates are only available if Three X Global (or its members) qualify under Article XXIX A. Ownership by the private-equity investor can affect this.', sources: [S('tr-xxixa-5p', 'Convention Art. XXIX A')], resolution: 'Confirm ownership chain and base-erosion facts; file NR301/NR302 forms.', professional: true });
  }
  // CFC check
  const usHolders = control.holders.filter((h) => ents.get(h.holderId)?.tax.residence === 'US');
  const usVotes = sum(usHolders.map((h) => h.pctVotesDeemed));
  if (usVotes > 0.5) {
    issues.push({ id: 'cfc', severity: 'warning', area: 'tax-us', title: `${ents.get(scn.roles.operator)?.name ?? 'The operator'} may become a controlled foreign corporation`, plain: 'U.S. shareholders would hold more than half of the votes. U.S. owners could then have to include some of the Canadian company’s income each year (subpart F and net CFC tested income), and file Form 5471. This model does not compute those inclusions.', sources: [S('irc-957', '26 U.S.C. § 957(a)'), S('irc-951', '26 U.S.C. § 951'), S('irc-951a', '26 U.S.C. § 951A'), S('irc-6038', '26 U.S.C. § 6038')], resolution: 'U.S. international tax review before closing.', professional: true });
  }
  if (usHolders.some((h) => h.pctVotesDeemed >= 0.1)) {
    issues.push({ id: 'form-5471', severity: 'info', area: 'tax-us', title: 'U.S. information reporting for foreign shareholdings', plain: 'A U.S. person acquiring 10% or more of a foreign corporation generally has information-reporting obligations (Form 5471).', sources: [S('irc-6046', '26 U.S.C. § 6046'), S('irc-6038', '26 U.S.C. § 6038')], resolution: 'Calendar the filings.', professional: true });
  }
  const fibaFees = sum(events.map((e) => e.costs.fibaHostingFee));
  if (fibaFees > 0) {
    issues.push({ id: 'fiba-withholding', severity: 'warning', area: 'withholding', title: 'Withholding on FIBA hosting/rights fees is unresolved', plain: `The model pays FIBA ${fmt(fibaFees)} over the period. If Canada treats these as royalties or rights fees, 25% could have to be withheld (up to ${fmt(fibaFees * 0.25)}) unless a treaty or contract term reduces it. This amount is not included in the totals.`, sources: [S('ita-212-1', 'ITA s. 212(1)(d)')], resolution: 'Review the executed hosting agreement (tax gross-up clauses) and FIBA’s residence/treaty status.', professional: true });
  }
  issues.push({ id: 'forecast-law', severity: 'info', area: 'data', title: '2027–2029 tax rules assume current law', plain: 'Tax rates and thresholds for forecast years use the most recent enacted values. Future legislation is not known.', sources: [], resolution: 'Re-verify rules each year (Settings → Knowledge freshness).', professional: false });
  for (const ev of scn.events) if (ev.hostingRights !== 'executed') {
    issues.push({ id: `rights-${ev.id}`, severity: 'warning', area: 'fiba', title: `Hosting rights not executed — ${ev.name}`, plain: `FIBA hosting rights for ${ev.name} are at "${ev.hostingRights.replace('-', ' ')}". FIBA owns the media, marketing and other commercial rights to Pro Circuit events, so revenue the operator can keep depends on the hosting agreement.`, sources: [S('fiba-b6-6', 'FIBA Internal Regulations Book 6, art. 6-6')], resolution: 'Negotiate and execute the hosting agreement; confirm which commercial rights are granted to the host.', professional: true });
    break;
  }

  const totals = {
    revenue: externalRevenue,
    costs: externalCosts,
    ebitda: sum(groupIds.flatMap((id) => EY[id].map((r) => r.ebitda))),
    netIncome: sum(groupIds.flatMap((id) => EY[id].map((r) => r.netIncome))),
    taxes: totalTax,
    withholding: whFinal,
    capitalInvested: sum(flows.filter((f) => f.capital && f.to === op && ['equity', 'preferred-equity', 'loan-drawdown', 'convertible', 'capital-contribution'].includes(f.kind)).map((f) => f.gross)),
    interest: sum(EY[op]?.map((r) => r.interestExpense) ?? []),
    debt: EY[op]?.[EY[op].length - 1]?.debtOutstanding ?? 0,
  };

  const result: ScenarioResult = {
    scenarioId: scn.id,
    years,
    fx,
    events,
    entityYears: EY,
    flows,
    loans,
    control,
    nfp,
    investor,
    txgReturns,
    group,
    monthly,
    peakFunding: peak,
    cumulativeCashNeed: -worst,
    breakEven,
    reconciliation: { ok: checks.every((c) => c.ok), checks },
    issues: dedupe(issues),
    totals,
  };

  if (!opts.skipComparison) {
    const neutral = neutralize(scn);
    const n = computeScenario(neutral, { skipComparison: true });
    const deltaByEntity: Record<string, number> = {};
    for (const id of Object.keys(group.taxByEntity)) deltaByEntity[id] = group.taxByEntity[id] - (n.group.taxByEntity[id] ?? 0);
    result.comparison = { neutralTotalTax: n.group.totalTax, delta: group.totalTax - n.group.totalTax, deltaByEntity, label: 'Same capital invested as non-voting common equity, with no intercompany interest, fees, royalties or revenue share' };
  }
  return result;
}

/** A tax-neutral comparison: replace financing and fee relationships between the U.S. venture and the operator with plain non-voting equity. */
export function neutralize(scn: Scenario): Scenario {
  const txg = scn.roles.usVenture;
  const op = scn.roles.operator;
  const finTypes = ['intercompany-loan', 'convertible', 'preferred-shares', 'common-shares', 'capital-contribution'];
  const feeTypes = ['management-agreement', 'license', 'revenue-share', 'jv', 'guarantee'];
  const between = (r: Relationship) => (r.from === txg && r.to === op) || (r.from === op && r.to === txg);
  const capital = scn.relationships.filter((r) => between(r) && finTypes.includes(r.type));
  const keep = scn.relationships.filter((r) => !(between(r) && (finTypes.includes(r.type) || feeTypes.includes(r.type))));
  const neutralRels: Relationship[] = capital.map((r) => ({
    id: `neutral-${r.id}`,
    type: 'common-shares',
    from: r.from,
    to: r.to,
    currency: r.currency,
    amount: r.amount,
    startYear: r.startYear,
    equity: { shares: 1, votesPerShare: 0, classLabel: 'Non-voting common (comparison)', payoutRatio: scn.assumptions.defaultPayout },
    evidence: 'assumption',
  }));
  return { ...scn, id: `${scn.id}-neutral`, relationships: [...keep, ...neutralRels] };
}

function legalFor(r: Relationship): string {
  const m: Record<string, string> = {
    'common-shares': 'Share subscription agreement; CBCA share issuance (directors’ resolution)',
    'preferred-shares': 'Share subscription; preferred share conditions in the articles',
    convertible: 'Convertible note / loan agreement',
    'intercompany-loan': 'Intercompany loan agreement (to be documented)',
    'third-party-loan': 'Third-party credit agreement',
    'capital-contribution': 'Capital contribution (contributed surplus) — board approval',
    'management-agreement': 'Management services agreement (to be documented)',
    license: 'Licence agreement (to be documented)',
    jv: 'Contractual joint venture agreement',
    'revenue-share': 'Revenue-sharing agreement',
    grant: 'Grant / contribution agreement',
    donation: 'Gift (donation)',
    'restricted-funding': 'Restricted funding agreement',
    guarantee: 'Guarantee agreement',
    'service-agreement': 'Services agreement at fair market value',
  };
  return m[r.type] ?? r.type;
}

function sourcesFor(r: Relationship): SourceRef[] {
  const out: SourceRef[] = [];
  if (r.type === 'intercompany-loan' || r.type === 'convertible') out.push(S('ita-18-4', 'ITA s. 18(4)'), S('ita-247-2', 'ITA s. 247(2)'));
  if (r.type === 'common-shares' || r.type === 'preferred-shares') out.push(S('ita-125-7-ccpc', 'ITA s. 125(7)'));
  if (r.type === 'management-agreement' || r.type === 'license') out.push(S('ita-247-2', 'ITA s. 247(2)'), S('tr-ix', 'Convention Art. IX'));
  if (r.type === 'donation') out.push(S('ita-248-qd', 'qualified donee'));
  return out;
}

function explainCapital(r: Relationship, ents: Map<string, EntityNode>): string {
  const a = ents.get(r.from)?.name ?? r.from;
  const b = ents.get(r.to)?.name ?? r.to;
  const amt = `${r.currency} ${Math.round(r.amount).toLocaleString('en-CA')}`;
  switch (r.type) {
    case 'intercompany-loan':
    case 'third-party-loan':
      return `${a} lends ${amt} to ${b}. ${b} now has the cash but owes it back with interest at ${((r.loan?.rate ?? 0) * 100).toFixed(2)}% over ${r.loan?.termYears} years.`;
    case 'convertible':
      return `${a} advances ${amt} to ${b} as a convertible loan. It earns interest and can turn into shares (${((r.convertible?.conversionPct ?? 0) * 100).toFixed(0)}% ownership) — the right counts for control tests now.`;
    case 'common-shares':
      return `${a} buys ${r.equity?.shares?.toLocaleString()} ${r.equity?.classLabel ?? 'common shares'} of ${b} for ${amt}. Nothing has to be repaid; ${a} shares in future profits and votes.`;
    case 'preferred-shares':
      return `${a} buys preferred shares of ${b} for ${amt}, with a ${((r.equity?.prefRate ?? 0) * 100).toFixed(1)}% preferred dividend paid before common shareholders.`;
    default:
      return `${a} contributes ${amt} to ${b}.`;
  }
}

function explainFee(r: Relationship, ents: Map<string, EntityNode>, gross: number): string {
  const provider = ents.get(r.from)?.name ?? r.from;
  const client = ents.get(r.to)?.name ?? r.to;
  if (r.type === 'service-agreement') return `${provider} pays ${client} ${fmt(gross)} for services under a services agreement.`;
  return `${client} pays ${provider} ${fmt(gross)} under the ${r.type.replace('-', ' ')}. This moves profit from ${client} to ${provider}; it is not new profit for the group.`;
}

function dedupe(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

export function fmt(n: number, cur = 'CAD'): string {
  const v = Math.round(n);
  return `${v < 0 ? '−' : ''}${cur === 'USD' ? 'US$' : '$'}${Math.abs(v).toLocaleString('en-CA')}`;
}
