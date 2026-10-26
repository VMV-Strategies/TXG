// What-If knobs: deterministic transformations of a scenario. Used by the
// What If? lab (before → after) and by one-at-a-time attribution.
import type { Scenario } from '../../types/domain';
import { sum } from '../finance/finance';

export interface Knobs {
  investmentScale: number;
  debtShare: number | null; // null = keep structure
  txgEquityPct: number;
  txgVoting: boolean;
  loanRate: number | null;
  loanTerm: number | null;
  sponsorshipMult: number;
  attendanceMult: number;
  priceMult: number;
  opexMult: number;
  fibaMult: number;
  staffingMult: number;
  fx: number | null;
  sbd: Scenario['taxSettings']['sbdTreatment'];
  treaty: boolean;
  llc: 'keep' | 'unknown' | 'disregarded' | 'partnership' | 'corporation';
  events: 'both' | 'men' | 'women';
  cancel: string; // `${eventId}:${year}` or ''
  exitMultiple: number;
}

export function defaultKnobs(s: Scenario): Knobs {
  return { investmentScale: 1, debtShare: null, txgEquityPct: 0.3, txgVoting: true, loanRate: null, loanTerm: null, sponsorshipMult: 1, attendanceMult: 1, priceMult: 1, opexMult: 1, fibaMult: 1, staffingMult: 1, fx: null, sbd: s.taxSettings.sbdTreatment, treaty: s.taxSettings.treatyClaimed, llc: 'keep', events: 'both', cancel: '', exitMultiple: s.investor.exitMultiple };
}

export const KNOB_LABEL: Record<keyof Knobs, string> = {
  investmentScale: 'Investment size',
  debtShare: 'Debt / equity mix',
  txgEquityPct: 'Share ownership',
  txgVoting: 'Voting control',
  loanRate: 'Interest rate',
  loanTerm: 'Loan term',
  sponsorshipMult: 'Sponsorship revenue',
  attendanceMult: 'Event attendance',
  priceMult: 'Ticket price',
  opexMult: 'Operating expenses',
  fibaMult: 'FIBA fees',
  staffingMult: 'Staffing costs',
  fx: 'FX (CAD per USD)',
  sbd: 'Small business deduction',
  treaty: 'Treaty benefits claimed',
  llc: 'LLC classification',
  events: 'Number of events',
  cancel: 'Event cancellation',
  exitMultiple: 'Investor exit value (multiple)',
};

const CAPITAL = ['intercompany-loan', 'common-shares', 'preferred-shares', 'convertible', 'capital-contribution'];

export function applyKnobs(base: Scenario, k: Knobs, only?: keyof Knobs): Scenario {
  const s: Scenario = structuredClone(base);
  const use = (key: keyof Knobs) => !only || only === key;
  const txg = s.roles.usVenture;
  const op = s.roles.operator;
  const isCa = (id: string) => s.entities.find((e) => e.id === id)?.jurisdiction === 'CA';
  if (use('investmentScale') && k.investmentScale !== 1) for (const r of s.relationships) if (r.from === txg && isCa(r.to) && CAPITAL.includes(r.type)) r.amount *= k.investmentScale;
  if (use('debtShare') && k.debtShare !== null) {
    const rels = s.relationships.filter((r) => r.from === txg && r.to === op && (r.type === 'intercompany-loan' || r.type === 'common-shares'));
    const fx = s.fx.cadPerUsd[s.years[0]] ?? 1.35;
    const total = sum(rels.map((r) => (r.currency === 'USD' ? r.amount * fx : r.amount))) || 2_000_000;
    const loanTemplate = rels.find((r) => r.type === 'intercompany-loan')?.loan ?? { rate: 0.07, termYears: 3, repayment: 'maturity' as const, cashInterest: true };
    s.relationships = s.relationships.filter((r) => !rels.includes(r));
    const founderShares = sum(s.relationships.filter((r) => r.to === op && r.type === 'common-shares').map((r) => r.equity?.shares ?? 0)) || 100;
    if (k.debtShare > 0) s.relationships.push({ id: 'wi-loan', type: 'intercompany-loan', from: txg, to: op, currency: 'CAD', amount: total * k.debtShare, startYear: s.years[0], loan: { ...loanTemplate }, evidence: 'assumption' });
    if (k.debtShare < 1) s.relationships.push({ id: 'wi-eq', type: 'common-shares', from: txg, to: op, currency: 'CAD', amount: total * (1 - k.debtShare), startYear: s.years[0], equity: { shares: Math.round((founderShares * k.txgEquityPct) / (1 - k.txgEquityPct)), votesPerShare: k.txgVoting ? 1 : 0, classLabel: 'Class B common', payoutRatio: 0.3 }, evidence: 'assumption' });
  }
  if (use('txgEquityPct') || use('txgVoting')) {
    const founderShares = sum(s.relationships.filter((r) => r.to === op && r.from !== txg && r.type === 'common-shares').map((r) => r.equity?.shares ?? 0)) || 100;
    for (const r of s.relationships.filter((r) => r.from === txg && r.to === op && r.type === 'common-shares' && r.equity)) {
      if (use('txgEquityPct') && (only === 'txgEquityPct' || k.debtShare === null)) r.equity!.shares = Math.round((founderShares * k.txgEquityPct) / (1 - Math.min(0.99, k.txgEquityPct)));
      if (use('txgVoting')) r.equity!.votesPerShare = k.txgVoting ? 1 : 0;
    }
  }
  for (const r of s.relationships.filter((r) => r.from === txg && r.loan)) {
    if (use('loanRate') && k.loanRate !== null) r.loan!.rate = k.loanRate;
    if (use('loanTerm') && k.loanTerm !== null) r.loan!.termYears = k.loanTerm;
  }
  if (use('sponsorshipMult') && k.sponsorshipMult !== 1) {
    for (const d of s.sponsors) {
      d.proposed *= k.sponsorshipMult;
      d.confirmed *= k.sponsorshipMult;
    }
    for (const e of s.events) for (const y of Object.keys(e.lines)) if (e.lines[+y].sponsorshipOverride !== undefined) e.lines[+y].sponsorshipOverride! *= k.sponsorshipMult;
  }
  for (const e of s.events)
    for (const y of e.years) {
      const L = e.lines[y];
      const T = e.ticketing[y];
      if (!L) continue;
      if (use('attendanceMult') && T && k.attendanceMult !== 1) T.sellThrough = Math.min(0.98, T.sellThrough * k.attendanceMult);
      if (use('priceMult') && T && k.priceMult !== 1) T.products = T.products.map((p) => ({ ...p, price: p.price * k.priceMult }));
      if (use('opexMult') && k.opexMult !== 1) for (const key of ['venue', 'production', 'courtsEquipment', 'officials', 'athleteTravelAccommodation', 'marketing', 'insurance', 'medicalSecurity', 'transportation', 'dataAccreditation', 'antiDopingIntegrity', 'otherCosts'] as const) L[key] *= k.opexMult;
      if (use('fibaMult') && k.fibaMult !== 1) L.fibaHostingFee *= k.fibaMult;
      if (use('staffingMult') && k.staffingMult !== 1) {
        L.staffingEmployees *= k.staffingMult;
        L.staffingContractors *= k.staffingMult;
      }
    }
  if (use('fx') && k.fx) s.fx = { ...s.fx, cadPerUsd: Object.fromEntries(s.years.map((y) => [y, k.fx!])) };
  if (use('sbd')) s.taxSettings.sbdTreatment = k.sbd;
  if (use('treaty')) s.taxSettings.treatyClaimed = k.treaty;
  if (use('llc') && k.llc !== 'keep') {
    const e = s.entities.find((x) => x.id === txg);
    if (e) e.tax.usClassification = k.llc;
  }
  if (use('events') && k.events !== 'both') s.events = s.events.filter((e) => (k.events === 'men' ? e.gender !== 'women' : e.gender !== 'men'));
  if (use('cancel') && k.cancel) {
    const [id, y] = k.cancel.split(':');
    const e = s.events.find((x) => x.id === id);
    if (e && e.lines[+y]) {
      const L = e.lines[+y];
      const sunk = 0.4;
      for (const key of Object.keys(L) as (keyof typeof L)[]) {
        if (key === 'contingencyPct') continue;
        if (['fnbShare', 'merchandise', 'vendorFees', 'media', 'digital', 'hostCityContribution', 'grantsEligible', 'hospitality', 'other', 'sponsorshipOverride'].includes(key)) (L[key] as number) = 0;
        else (L[key] as number) = ((L[key] as number) ?? 0) * sunk;
      }
      if (e.ticketing[+y]) e.ticketing[+y] = { ...e.ticketing[+y], sellThrough: 0 };
      // Sponsorship for the cancelled year is assumed refunded: the cancelled year is split into its own event with zero sponsorship.
      s.events = s.events.map((x) => (x.id === id ? { ...x, notes: `${x.notes ?? ''} Cancelled in ${y} (40% of costs sunk, revenue refunded).` } : x));
      {
        L.sponsorshipOverride = 0;
        const orig = s.events.find((x) => x.id === id)!;
        const copy = { ...orig, id: `${orig.id}-cxl-${y}`, name: `${orig.name} (cancelled)`, years: [+y], lines: { [+y]: L }, ticketing: { [+y]: orig.ticketing[+y] } };
        orig.years = orig.years.filter((yy) => yy !== +y);
        s.events.push(copy);
      }
    }
  }
  if (use('exitMultiple')) s.investor.exitMultiple = k.exitMultiple;
  return s;
}

