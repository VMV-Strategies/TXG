// Structure presets (A–G), multi-criteria scoring, Pareto analysis and the
// "What Makes the Most Sense?" recommendation narrative.
import type { EntityNode, Relationship, Scenario } from '../../types/domain';
import { computeScenario, fmt, type ScenarioResult } from '../scenarios/compute';
import { sum } from '../finance/finance';

export type PresetId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';

export const PRESETS: { id: PresetId; name: string; summary: string }[] = [
  { id: 'A', name: 'All debt', summary: 'The full Canadian investment is an intercompany loan at 7% for 3 years.' },
  { id: 'B', name: 'All equity', summary: 'The full investment buys a 40% voting common-share stake.' },
  { id: 'C', name: 'Hybrid financing', summary: '60% loan, 40% equity (30% voting stake).' },
  { id: 'D', name: 'Contractual joint venture', summary: 'Funding contribution for 35% of event EBITDA under a JV agreement.' },
  { id: 'E', name: 'Canadian event subsidiary', summary: 'A new Canadian event company runs the events; the operator owns 60%, Three X Global 40% plus a loan.' },
  { id: 'F', name: 'Management and licensing', summary: 'Smaller equity stake and loan, plus a documented 5%-of-revenue management fee and 3% trademark licence.' },
  { id: 'G', name: 'Custom (current)', summary: 'The structure currently on the Entity Map.' },
  { id: 'H', name: 'Convertible loan', summary: '6% convertible loan for 3 years that converts into a 25% voting stake at maturity.' },
  { id: 'I', name: 'Preferred equity', summary: 'Non-voting cumulative preferred shares with an 8% preferred dividend.' },
  { id: 'J', name: 'Intellectual property licence', summary: 'Loan funding plus a documented 4% trademark / event-format licence; no shares.' },
  { id: 'K', name: 'Revenue-sharing arrangement', summary: 'Funding contribution in exchange for 12% of event revenue (participating-payment case).' },
  { id: 'L', name: 'Multi-entity structure', summary: 'Event subsidiary (E) plus a documented management services agreement with Three X Global.' },
];

function totalCanadianCapitalCad(scn: Scenario): number {
  const txg = scn.roles.usVenture;
  const rels = scn.relationships.filter((r) => r.from === txg && scn.entities.find((e) => e.id === r.to)?.jurisdiction === 'CA' && ['intercompany-loan', 'common-shares', 'preferred-shares', 'convertible', 'capital-contribution'].includes(r.type));
  const fx = scn.fx.cadPerUsd[scn.years[0]] ?? 1.35;
  const t = sum(rels.map((r) => (r.currency === 'USD' ? r.amount * fx : r.amount)));
  return t || 2_000_000;
}

export function applyPreset(base: Scenario, id: PresetId): Scenario {
  if (id === 'G') return { ...base, id: `${base.id}-G`, name: `${base.name} (custom)` };
  const txg = base.roles.usVenture;
  const op = base.roles.operator;
  const amt = totalCanadianCapitalCad(base);
  const strip = base.relationships.filter((r) => !((r.from === txg && base.entities.find((e) => e.id === r.to)?.jurisdiction === 'CA') || (r.to === txg && base.entities.find((e) => e.id === r.from)?.jurisdiction === 'CA' && r.type !== 'dividend')));
  const loan = (to: string, a: number, rid = 'p-loan'): Relationship => ({ id: rid, type: 'intercompany-loan', from: txg, to, currency: 'CAD', amount: a, startYear: base.years[0], loan: { rate: 0.07, termYears: 3, repayment: 'maturity', cashInterest: true }, evidence: 'assumption', label: 'Intercompany loan' });
  const shares = (to: string, a: number, pct: number, existing = 100, rid = 'p-eq'): Relationship => ({ id: rid, type: 'common-shares', from: txg, to, currency: 'CAD', amount: a, startYear: base.years[0], equity: { shares: Math.round((existing * pct) / (1 - pct)), votesPerShare: 1, classLabel: 'Class B common', payoutRatio: 0.3 }, evidence: 'assumption' });
  const s: Scenario = JSON.parse(JSON.stringify(base));
  s.id = `${base.id}-${id}`;
  s.name = `${PRESETS.find((p) => p.id === id)!.name}`;
  s.baseline = base.baseline;
  const existingOpShares = sum(base.relationships.filter((r) => r.to === op && r.from !== txg && (r.type === 'common-shares' || r.type === 'preferred-shares')).map((r) => r.equity?.shares ?? 0)) || 100;
  switch (id) {
    case 'A':
      s.relationships = [...strip, loan(op, amt)];
      break;
    case 'B':
      s.relationships = [...strip, shares(op, amt, 0.4, existingOpShares)];
      break;
    case 'C':
      s.relationships = [...strip, loan(op, amt * 0.6), shares(op, amt * 0.4, 0.3, existingOpShares)];
      break;
    case 'D':
      s.relationships = [
        ...strip,
        { id: 'p-jv-fund', type: 'capital-contribution', from: txg, to: op, label: 'JV funding contribution', currency: 'CAD', amount: amt, startYear: base.years[0], evidence: 'assumption' },
        { id: 'p-jv', type: 'jv', from: txg, to: op, label: 'Contractual JV — 35% of event EBITDA', currency: 'CAD', amount: 0, startYear: base.years[0], revenueShare: { pct: 0.35, base: 'event-ebitda', characterization: 'partnership-pe' }, evidence: 'assumption' },
      ];
      break;
    case 'E': {
      const evco: EntityNode = { id: 'evco', name: 'Toronto 3x3 Event Co. (proposed subsidiary)', kind: 'ca-corp', jurisdiction: 'CA', x: 420, y: 330, inGroup: true, currency: 'CAD', evidence: 'assumption', overhead: Object.fromEntries(base.years.map((y) => [y, 40000])), tax: { residence: 'CA', associatedTaxableCapital: (base.entities.find((e) => e.id === op)?.tax.associatedTaxableCapital ?? 0) + amt, aaii: 0, businessLimitShare: 0.5 } };
      s.entities = [...s.entities.filter((e) => e.id !== 'evco'), evco];
      const opE = s.entities.find((e) => e.id === op)!;
      opE.tax.businessLimitShare = 0.5;
      s.events = s.events.map((e) => ({ ...e, operatorId: 'evco' }));
      const rels: Relationship[] = [
        ...strip,
        { id: 'p-parent', type: 'common-shares', from: op, to: 'evco', currency: 'CAD', amount: 100, startYear: base.years[0], equity: { shares: 60, votesPerShare: 1, classLabel: 'Common', payoutRatio: 0.5 }, evidence: 'assumption' },
        { id: 'p-eq', type: 'common-shares', from: txg, to: 'evco', currency: 'CAD', amount: amt * 0.4, startYear: base.years[0], equity: { shares: 40, votesPerShare: 1, classLabel: 'Common', payoutRatio: 0.5 }, evidence: 'assumption' },
        loan('evco', amt * 0.6),
        ...base.relationships.filter((r) => r.type === 'service-agreement' && r.to === op).map((r) => ({ ...r, id: `${r.id}-e`, to: 'evco' })),
      ];
      s.relationships = rels.filter((r) => !(r.type === 'service-agreement' && r.to === op));
      s.roles = { ...s.roles, operator: 'evco' };
      break;
    }
    case 'H':
      s.relationships = [...strip, { id: 'p-conv', type: 'convertible', from: txg, to: op, currency: 'CAD', amount: amt, startYear: base.years[0], convertible: { rate: 0.06, termYears: 3, conversionPct: 0.25, convertAtMaturity: true, votesPerShare: 1 }, evidence: 'assumption' }];
      break;
    case 'I':
      s.relationships = [...strip, { id: 'p-pref', type: 'preferred-shares', from: txg, to: op, currency: 'CAD', amount: amt, startYear: base.years[0], equity: { shares: 2000, votesPerShare: 0, classLabel: 'Non-voting cumulative preferred', prefRate: 0.08, prefCumulative: true }, evidence: 'assumption' }];
      break;
    case 'J':
      s.relationships = [...strip, loan(op, amt), { id: 'p-lic', type: 'license', from: txg, to: op, label: 'Trademark / event-format licence — 4% of event revenue', currency: 'CAD', amount: 0, startYear: base.years[0], fee: { basis: 'pct-revenue', pct: 0.04, servicesInCanadaPct: 0, documentedFmv: true, ipType: 'trademark' }, evidence: 'assumption' }];
      break;
    case 'K':
      s.relationships = [
        ...strip,
        { id: 'p-rs-fund', type: 'capital-contribution', from: txg, to: op, label: 'Funding contribution', currency: 'CAD', amount: amt, startYear: base.years[0], evidence: 'assumption' },
        { id: 'p-rs', type: 'revenue-share', from: txg, to: op, label: 'Revenue share — 12% of event revenue', currency: 'CAD', amount: 0, startYear: base.years[0], revenueShare: { pct: 0.12, base: 'event-revenue', characterization: 'participating-payment' }, evidence: 'assumption' },
      ];
      break;
    case 'L': {
      const e = applyPreset(base, 'E');
      e.id = `${base.id}-L`;
      e.name = PRESETS.find((p) => p.id === 'L')!.name;
      e.relationships.push({ id: 'p-mgmt-l', type: 'management-agreement', from: txg, to: 'evco', label: 'Management services — 4% of event revenue', currency: 'CAD', amount: 0, startYear: base.years[0], fee: { basis: 'pct-revenue', pct: 0.04, servicesInCanadaPct: 0.25, documentedFmv: true }, evidence: 'assumption' });
      return e;
    }
    case 'F':
      s.relationships = [
        ...strip,
        shares(op, amt * 0.5, 0.2, existingOpShares),
        loan(op, amt * 0.5),
        { id: 'p-mgmt', type: 'management-agreement', from: txg, to: op, label: 'Management services — 5% of event revenue', currency: 'CAD', amount: 0, startYear: base.years[0], fee: { basis: 'pct-revenue', pct: 0.05, servicesInCanadaPct: 0.25, documentedFmv: true }, evidence: 'assumption' },
        { id: 'p-lic', type: 'license', from: txg, to: op, label: 'Trademark / event-format licence — 3% of event revenue', currency: 'CAD', amount: 0, startYear: base.years[0], fee: { basis: 'pct-revenue', pct: 0.03, servicesInCanadaPct: 0, documentedFmv: true, ipType: 'trademark' }, evidence: 'assumption' },
      ];
      break;
  }
  return s;
}

export type ObjectiveId = 'minTax' | 'investorReturn' | 'canadianRetained' | 'txgReturn' | 'flexibility' | 'lowFinancingRisk' | 'canadianControl' | 'community';

export const OBJECTIVES: { id: ObjectiveId; label: string; better: 'higher' | 'lower' }[] = [
  { id: 'minTax', label: 'Minimize combined taxes', better: 'lower' },
  { id: 'investorReturn', label: 'Maximize investor return', better: 'higher' },
  { id: 'canadianRetained', label: 'Maximize Canadian retained cash', better: 'higher' },
  { id: 'txgReturn', label: 'Maximize Three X Global’s return', better: 'higher' },
  { id: 'flexibility', label: 'Preserve operational flexibility', better: 'higher' },
  { id: 'lowFinancingRisk', label: 'Lower financing risk', better: 'higher' },
  { id: 'canadianControl', label: 'Preserve Canadian control', better: 'higher' },
  { id: 'community', label: 'Support community programming', better: 'higher' },
];

export interface StructureEval {
  id: string;
  name: string;
  scenario: Scenario;
  result: ScenarioResult;
  raw: Record<ObjectiveId, number>;
  normalized: Record<ObjectiveId, number>;
  score: number;
  contributions: Record<ObjectiveId, number>;
  pareto: boolean;
  legalUncertainty: 'low' | 'medium' | 'high';
  unresolved: string[];
  feasible: boolean;
  feasibilityNotes: string[];
}

function rawObjectives(scn: Scenario, r: ScenarioResult): Record<ObjectiveId, number> {
  const op = scn.roles.operator;
  const opRows = r.entityYears[op] ?? [];
  const last = opRows[opRows.length - 1];
  const fixedObligations = sum(opRows.map((x) => x.interestExpense + x.feesPaid + x.royaltiesPaid));
  const debt = last?.debtOutstanding ?? 0;
  const negCash = Object.values(r.entityYears).flat().filter((x) => x.closingCash < -0.5).length;
  const revenue = Math.max(1, r.totals.revenue);
  return {
    minTax: r.group.totalTax,
    investorReturn: r.investor.irr ?? -1,
    canadianRetained: (last?.closingCash ?? 0) + Math.max(0, last?.retainedEarnings ?? 0) * 0,
    txgReturn: sum(r.flows.filter((f) => f.to === scn.roles.usVenture && scn.entities.find((e) => e.id === f.from)?.jurisdiction === 'CA').map((f) => f.net)) + (r.txgReturns.exitProceeds ?? 0),
    flexibility: 1 - Math.min(1, fixedObligations / revenue) - (scn.relationships.some((x) => x.type === 'jv' || x.type === 'revenue-share') ? 0.2 : 0),
    lowFinancingRisk: 1 - Math.min(1, debt / Math.max(1, r.totals.capitalInvested)) - negCash * 0.25,
    canadianControl: r.control.status === 'likely-ccpc' ? 1 : r.control.status === 'uncertain' ? 0.5 : 0,
    community: sum((r.nfp.years ?? []).map((y) => y.totalInflows)),
  };
}

export function evaluateStructures(base: Scenario, weights: Partial<Record<ObjectiveId, number>>, presets: PresetId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G']): StructureEval[] {
  const evals = presets.map((p) => {
    const scn = p === 'G' ? base : applyPreset(base, p);
    const result = computeScenario(scn, { skipComparison: true });
    const raw = rawObjectives(scn, result);
    const professional = result.issues.filter((i) => i.professional && (i.severity === 'warning' || i.severity === 'critical'));
    const lowConf = result.flows.filter((f) => f.withholdingDetail?.confidence === 'low').length;
    const legalUncertainty: StructureEval['legalUncertainty'] = professional.length + (lowConf ? 2 : 0) >= 7 ? 'high' : professional.length + (lowConf ? 2 : 0) >= 4 ? 'medium' : 'low';
    const notes: string[] = [];
    let feasible = true;
    if (result.control.status === 'likely-not-ccpc' && (weights.canadianControl ?? 0) > 0) notes.push('Fails the CCPC control tests on the facts entered.');
    if (Object.values(result.entityYears).flat().some((x) => x.closingCash < -0.5)) {
      notes.push('An entity runs out of cash — not feasible without additional funding.');
      feasible = false;
    }
    return { id: p, name: p === 'G' ? `${base.name} (current)` : PRESETS.find((x) => x.id === p)!.name, scenario: scn, result, raw, normalized: {} as Record<ObjectiveId, number>, score: 0, contributions: {} as Record<ObjectiveId, number>, pareto: false, legalUncertainty, unresolved: professional.map((i) => i.title), feasible, feasibilityNotes: notes };
  });
  for (const o of OBJECTIVES) {
    const vals = evals.map((e) => e.raw[o.id]);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    for (const e of evals) {
      const n = max === min ? 0.5 : (e.raw[o.id] - min) / (max - min);
      e.normalized[o.id] = o.better === 'lower' ? 1 - n : n;
    }
  }
  const wsum = sum(OBJECTIVES.map((o) => weights[o.id] ?? 0)) || 1;
  for (const e of evals) {
    let s = 0;
    for (const o of OBJECTIVES) {
      const c = ((weights[o.id] ?? 0) / wsum) * e.normalized[o.id];
      e.contributions[o.id] = c;
      s += c;
    }
    e.score = s;
  }
  // Pareto efficiency among active objectives
  const active = OBJECTIVES.filter((o) => (weights[o.id] ?? 0) > 0);
  for (const e of evals) {
    e.pareto = !evals.some((f) => f !== e && active.every((o) => f.normalized[o.id] >= e.normalized[o.id]) && active.some((o) => f.normalized[o.id] > e.normalized[o.id]));
  }
  return evals.sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.score - a.score);
}

export interface Recommendation {
  headline: string;
  strongest: StructureEval | null;
  why: string[];
  whoBenefits: string;
  whoPays: string;
  taxes: string;
  keyAssumptions: string[];
  risks: string[];
  competitive: string[];
  verify: string[];
  quantified: string[];
  legalConditions: string[];
  commercialAssumptions: string[];
  unresolved: string[];
  professional: string[];
  tie: boolean;
}

export function recommend(evals: StructureEval[], weights: Partial<Record<ObjectiveId, number>>): Recommendation {
  const feasible = evals.filter((e) => e.feasible);
  const top = feasible[0] ?? evals[0] ?? null;
  if (!top) return { headline: 'No structures to compare.', strongest: null, why: [], whoBenefits: '', whoPays: '', taxes: '', keyAssumptions: [], risks: [], competitive: [], verify: [], quantified: [], legalConditions: [], commercialAssumptions: [], unresolved: [], professional: [], tie: false };
  const second = feasible[1];
  const tie = !!second && Math.abs(top.score - second.score) < 0.03;
  const bothUncertain = tie && top.legalUncertainty !== 'low' && second.legalUncertainty !== 'low';
  const drivers = OBJECTIVES.filter((o) => (weights[o.id] ?? 0) > 0)
    .map((o) => ({ o, c: top.contributions[o.id], n: top.normalized[o.id] }))
    .sort((a, b) => b.c - a.c)
    .slice(0, 3);
  const r = top.result;
  const scn = top.scenario;
  const txgName = scn.entities.find((e) => e.id === scn.roles.usVenture)?.name ?? 'Three X Global';
  const opName = scn.entities.find((e) => e.id === scn.roles.operator)?.name ?? 'the operator';
  const toTxg = sum(r.flows.filter((f) => f.to === scn.roles.usVenture && scn.entities.find((e) => e.id === f.from)?.jurisdiction === 'CA').map((f) => f.net));
  const why = drivers.map((d) => `${d.o.label}: ranks ${d.n >= 0.99 ? 'best' : d.n >= 0.66 ? 'well' : d.n >= 0.33 ? 'middle' : 'low'} among the structures compared (${describeRaw(d.o.id, top.raw[d.o.id])}).`);
  if (!top.feasible) why.unshift('No structure is fully feasible on current numbers; this is the least-bad option.');
  const headline = bothUncertain
    ? `${top.name} and ${second!.name} score almost the same, and both depend on unresolved legal questions — there is no reliable winner yet.`
    : `${top.name} currently appears strongest for the priorities you set.`;
  const competitive = feasible.filter((e) => e !== top && (e.pareto || top.score - e.score < 0.1)).map((e) => `${e.name} (score ${(e.score * 100).toFixed(0)} vs ${(top.score * 100).toFixed(0)}${e.pareto ? '; not dominated on any priority' : ''})`);
  const crit = r.issues.filter((i) => i.severity === 'critical' || i.severity === 'warning');
  return {
    headline,
    strongest: top,
    why,
    whoBenefits: `${txgName} receives about ${fmt(toTxg)} from Canada over the period after Canadian withholding, plus an estimated ${fmt(r.txgReturns.exitProceeds)} of exit value. ${opName} ends with about ${fmt((r.entityYears[scn.roles.operator] ?? []).slice(-1)[0]?.closingCash ?? 0)} of cash.`,
    whoPays: `${opName} bears operating costs, ${fmt(sum((r.entityYears[scn.roles.operator] ?? []).map((x) => x.interestExpense + x.feesPaid + x.royaltiesPaid + x.revSharePaid)))} of interest/fees/profit share, and Canadian tax of ${fmt(r.group.canadianCorporateTax)}.`,
    taxes: `Combined modelled tax ${fmt(r.group.totalTax)}: Canadian corporate ${fmt(r.group.canadianCorporateTax)}, withholding ${fmt(r.group.withholdingFinal)}, U.S. ${fmt(r.group.usTax)}. Temporary Reg. 105 withholding: ${fmt(r.group.withholdingRecoverable)}.`,
    keyAssumptions: [
      `Sponsorship basis: ${scn.assumptions.sponsorshipBasis} (no sponsorship is signed in the default data).`,
      `Exit at ${scn.investor.exitMultiple}× EBITDA in ${scn.investor.exitYear}.`,
      `U.S. classification of ${txgName}: ${scn.entities.find((e) => e.id === scn.roles.usVenture)?.tax.usClassification ?? 'unknown'}.`,
      `FIBA hosting fees and rights are assumptions until hosting agreements are executed.`,
    ],
    risks: crit.slice(0, 6).map((i) => i.title),
    competitive,
    verify: Array.from(new Set(r.issues.filter((i) => i.professional).map((i) => i.resolution))).slice(0, 8),
    quantified: [`Group pre-tax result ${fmt(r.group.groupPreTax)}`, `Total tax ${fmt(r.group.totalTax)}`, `Investor IRR ${r.investor.irr === null ? 'undefined' : `${(r.investor.irr * 100).toFixed(1)}%`}`, `Investor MOIC ${r.investor.moic === null ? 'n/a' : `${r.investor.moic.toFixed(2)}×`}`],
    legalConditions: r.control.tests.map((t) => `${t.label}: ${t.result}`),
    commercialAssumptions: [`Events modelled: ${scn.events.length}`, `Revenue relies on ${scn.sponsors.filter((s) => s.status !== 'signed').length} unsigned sponsor deals`],
    unresolved: top.unresolved,
    professional: ['Canadian tax counsel: control, thin cap, withholding, transfer pricing', 'U.S. tax adviser: LLC classification, FTC, CFC, state', 'Securities counsel: investor raise and any success fees', 'Not-for-profit counsel: Foundation relationships'],
    tie,
  };
}

function describeRaw(id: ObjectiveId, v: number): string {
  switch (id) {
    case 'minTax':
      return `total tax ${fmt(v)}`;
    case 'investorReturn':
      return v <= -1 ? 'IRR undefined' : `investor IRR ${(v * 100).toFixed(1)}%`;
    case 'canadianRetained':
      return `operator closing cash ${fmt(v)}`;
    case 'txgReturn':
      return `cash and exit value to Three X Global ${fmt(v)}`;
    case 'canadianControl':
      return v === 1 ? 'CCPC tests appear met' : v === 0.5 ? 'CCPC status uncertain' : 'CCPC tests appear failed';
    case 'community':
      return `Foundation inflows ${fmt(v)}`;
    default:
      return `index ${(v * 100).toFixed(0)}`;
  }
}
