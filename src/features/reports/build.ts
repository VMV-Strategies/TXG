import type { Scenario } from '../../types/domain';
import type { ScenarioResult } from '../../engines/scenarios/compute';
import { evaluateStructures, recommend } from '../../engines/optimization/optimize';
import { FIBA_REQUIREMENTS, FIBA_STATUS_LABEL } from '../../data/fiba';
import { sum } from '../../engines/finance/finance';
import { money, pct, toDisplay } from '../../utils/format';
import { sponsorValue } from '../../engines/events/events';
import { DEFAULT_WEIGHTS, MISSING_DOCS } from '../../data/constants';
import { TAX_RULES } from '../../engines/tax/rules';
import type { Report } from './exporters';

export const REPORT_TYPES = [
  { id: 'structure', title: 'Investment Structure Comparison' },
  { id: 'forecast', title: 'Three-Year Financial Forecast' },
  { id: 'waterfall', title: 'Cash Flow and Tax Waterfall' },
  { id: 'investor', title: 'Investor Returns' },
  { id: 'fiba', title: 'FIBA Event Feasibility' },
  { id: 'sponsorship', title: 'Sponsorship Revenue Plan' },
  { id: 'ccpc', title: 'Corporate Control and CCPC Risk Review' },
  { id: 'nfp', title: 'NFP Participation Review' },
  { id: 'checklist', title: 'Missing Documents and Professional Review Checklist' },
  { id: 'recommended', title: 'Recommended Structure Summary' },
] as const;
export type ReportId = (typeof REPORT_TYPES)[number]['id'];

export function buildReport(id: ReportId, scn: Scenario, r: ScenarioResult, cur: 'CAD' | 'USD'): Report {
  const d = (n: number, y?: number) => Math.round(toDisplay(n, cur, r, y));
  const m = (n: number, y?: number) => money(toDisplay(n, cur, r, y), cur);
  const op = scn.roles.operator;
  const txg = scn.roles.usVenture;
  const opName = scn.entities.find((e) => e.id === op)?.name ?? 'the operator';
  const txgName = scn.entities.find((e) => e.id === txg)?.name ?? 'Three X Global';
  const opRows = r.entityYears[op] ?? [];
  const last = opRows[opRows.length - 1];
  const toTxg = sum(r.flows.filter((f) => f.to === txg && scn.entities.find((e) => e.id === f.from)?.jurisdiction === 'CA').map((f) => f.net));
  const baseSummary = `Under this scenario, ${opName} is expected to retain approximately ${m(last?.closingCash ?? 0)} of cash after operating costs, debt payments and modelled taxes. ${txgName} is expected to receive ${m(toTxg)} from Canada over ${r.years[0]}–${r.years[r.years.length - 1]}. These estimates depend on the assumed sponsorship revenue and the tax treatment described below.`;
  const assumptions = [
    `Data baseline: ${scn.baseline === 'synthetic' ? 'synthetic demonstration data (hypothetical)' : scn.baseline === 'workbook' ? 'imported management workbook' : 'user-entered assumptions'}.`,
    `Sponsorship counted on a ${scn.assumptions.sponsorshipBasis} basis; ${scn.sponsors.filter((s) => s.status === 'signed').length} of ${scn.sponsors.length} deals signed.`,
    `FX: ${r.years.map((y) => `${y} ${r.fx[y].toFixed(2)}`).join(', ')} CAD per USD (${scn.fx.mode}).`,
    `FIBA hosting rights: ${scn.events.map((e) => `${e.name} — ${e.hostingRights}`).join('; ')}.`,
    `U.S. classification of ${txgName}: ${scn.entities.find((e) => e.id === txg)?.tax.usClassification ?? 'unknown'}; small business deduction: ${scn.taxSettings.sbdTreatment}.`,
    `Tax rules: enacted law reviewed 2026-10-25; forecast years assume current law continues (${TAX_RULES.length} rules versioned).`,
  ];
  const evidence = [
    `Confirmed by contract: ${scn.relationships.filter((x) => x.evidence === 'confirmed-contract').length} relationships, ${scn.events.filter((e) => e.hostingRights === 'executed').length} hosting agreements.`,
    `Corporate records: ${scn.entities.filter((e) => e.evidence === 'corporate-record').length} entities.`,
    `Assumptions / synthetic / pending items: ${scn.relationships.filter((x) => ['assumption', 'synthetic', 'pending'].includes(x.evidence)).length} relationships.`,
    `Reconciliation checks: ${r.reconciliation.ok ? 'all passed' : 'FAILED — see Money Flow'}.`,
  ];
  const base: Omit<Report, 'title' | 'sections' | 'summary'> = { id, assumptions, evidence, generatedAt: new Date().toISOString(), scenarioName: scn.name, currency: cur };
  const title = REPORT_TYPES.find((t) => t.id === id)!.title;
  switch (id) {
    case 'structure': {
      const ev = evaluateStructures(scn, DEFAULT_WEIGHTS);
      return { ...base, title, summary: [baseSummary, `${ev[0].name} scores highest on balanced priorities; ${ev.filter((e) => e.pareto).length} structures are on the trade-off frontier.`], sections: [{ title: 'Structures', header: ['Structure', 'Score', 'Total tax', 'Withholding', 'Investor IRR', 'Operator closing cash', 'To Three X Global', 'CCPC', 'Legal uncertainty', 'Feasible'], rows: ev.map((e) => [e.name, Math.round(e.score * 100), d(e.result.group.totalTax), d(e.result.group.withholdingFinal), e.result.investor.irr === null ? 'undefined' : pct(e.result.investor.irr), d(e.raw.canadianRetained), d(e.raw.txgReturn), e.result.control.status, e.legalUncertainty, e.feasible ? 'yes' : 'no']) }] };
    }
    case 'forecast':
      return {
        ...base,
        title,
        summary: [baseSummary],
        sections: [
          { title: 'Events', header: ['Event', 'Year', 'Revenue', 'Costs', 'EBITDA', 'Paid admissions'], rows: r.events.map((e) => [e.name, e.year, d(e.revenueTotal, e.year), d(e.costTotal, e.year), d(e.ebitda, e.year), Math.round(e.tickets.paidAdmissions)]) },
          ...scn.entities
            .filter((e) => e.inGroup)
            .map((e) => ({ title: e.name.slice(0, 28), header: ['Year', 'Revenue', 'EBITDA', 'Interest exp.', 'Income before tax', 'Income tax', 'Net income', 'Closing cash', 'Retained earnings'], rows: (r.entityYears[e.id] ?? []).map((x) => [x.year, d(x.eventRevenue + x.grantsReceived, x.year), d(x.ebitda, x.year), d(x.interestExpense, x.year), d(x.incomeBeforeTax, x.year), d(x.incomeTax, x.year), d(x.netIncome, x.year), d(x.closingCash, x.year), d(x.retainedEarnings, x.year)]) })),
        ],
      };
    case 'waterfall':
      return {
        ...base,
        title,
        summary: [baseSummary, `Total modelled tax: ${m(r.group.totalTax)} (Canadian corporate ${m(r.group.canadianCorporateTax)}, final withholding ${m(r.group.withholdingFinal)}, U.S. ${m(r.group.usTax)}); temporary Reg. 105 withholding ${m(r.group.withholdingRecoverable)}.`],
        sections: [
          { title: 'Tax waterfall', header: ['Step', 'Amount'], rows: [['External revenue', d(r.group.externalRevenue)], ['External costs', -d(r.group.externalCosts)], ['Group pre-tax result', d(r.group.groupPreTax)], ['Canadian corporate tax', -d(r.group.canadianCorporateTax)], ['Final withholding', -d(r.group.withholdingFinal)], ['U.S. tax', -d(r.group.usTax)], ['After-tax value', d(r.group.afterTaxValue)]] },
          { title: 'Cross-border payments', header: ['Year', 'Type', 'From', 'To', 'Gross', 'Withheld', 'Permanence', 'Basis'], rows: r.flows.filter((f) => f.withholdingDetail?.applies).map((f) => [f.year, f.kind, f.from, f.to, d(f.gross, f.year), d(f.withholding, f.year), f.withholdingDetail?.permanence ?? '', f.withholdingDetail?.basis ?? '']) },
          { title: 'Monthly cash (operator)', header: ['Month', 'Inflow', 'Outflow', 'Closing', 'Cumulative before financing'], rows: (r.monthly[op] ?? []).map((x) => [x.month, d(x.inflow), d(x.outflow), d(x.closing), d(x.preFinancingCumulative)]) },
        ],
      };
    case 'investor':
      return {
        ...base,
        title,
        summary: [`Investor IRR ${r.investor.irr === null ? 'is undefined' : pct(r.investor.irr)} and MOIC ${r.investor.moic === null ? 'n/a' : `${r.investor.moic.toFixed(2)}×`}, pre-tax. ${txgName}’s IRR on its Canadian position: ${r.txgReturns.irr === null ? 'undefined' : pct(r.txgReturns.irr)}.`, baseSummary],
        sections: [
          { title: 'Investor cash flows', header: ['Year', 'Type', 'Amount'], rows: r.investor.flows.map((f) => [f.year, f.label, d(f.amount, f.year)]) },
          { title: 'Exit value bridge', header: ['Item', 'Amount'], rows: r.investor.exitBreakdown.map((x) => [x.label, d(x.amount)]) },
          { title: 'Three X Global cash with Canada', header: ['Year', 'Net amount'], rows: r.txgReturns.flows.map((f) => [f.year, d(f.amount, f.year)]) },
        ],
      };
    case 'fiba':
      return {
        ...base,
        title,
        summary: [`${scn.events.length} events modelled; ${scn.events.filter((e) => e.hostingRights === 'executed').length} hosting agreements executed. Book 6 (in force 22 April 2026) confirms FIBA owns Pro Circuit commercial rights — host revenue depends on the hosting agreement.`],
        sections: [
          { title: 'Requirements', header: ['Category', 'Requirement', 'WT', 'WS', 'Challenger', 'Endorsed', 'Citation'], rows: FIBA_REQUIREMENTS.map((q) => [q.category, q.title, ...(['WT', 'WS', 'Challenger', 'Endorsed'] as const).map((f) => (q.byFormat[f] ? FIBA_STATUS_LABEL[q.byFormat[f]!] : '—')), q.citation ?? '']) },
          { title: 'Event economics', header: ['Event', 'Year', 'Revenue', 'Costs', 'EBITDA', 'Break-even gap'], rows: r.events.map((e) => [e.name, e.year, d(e.revenueTotal, e.year), d(e.costTotal, e.year), d(e.ebitda, e.year), d(e.breakEvenGap, e.year)]) },
        ],
      };
    case 'sponsorship':
      return {
        ...base,
        title,
        summary: [`Pipeline: proposed ${m(sum(scn.sponsors.map((s) => sponsorValue(s, 'proposed'))))}, probability-weighted ${m(sum(scn.sponsors.map((s) => sponsorValue(s, 'expected'))))}, signed ${m(sum(scn.sponsors.map((s) => sponsorValue(s, 'confirmed'))))} per event-year.`],
        sections: [{ title: 'Pipeline', header: ['Sponsor', 'Tier', 'Event', 'Proposed', 'Confirmed', 'Cash', 'Status', 'Probability', 'Payment month', 'Exclusive', 'FIBA conflict'], rows: scn.sponsors.map((s) => [s.name, s.tier, scn.events.find((e) => e.id === s.eventId)?.name ?? '', d(s.proposed), d(s.confirmed), s.cash ? 'cash' : 'in-kind', s.status, pct(s.probability, 0), s.paymentMonth, s.exclusivity ? 'yes' : 'no', s.fibaRightsConflict]) }],
      };
    case 'ccpc':
      return {
        ...base,
        title,
        summary: [r.control.statusPlain, r.control.headroomPlain],
        sections: [
          { title: 'Tests', header: ['Test', 'Result', 'Explanation'], rows: r.control.tests.map((t) => [t.label, t.result, t.plain]) },
          { title: 'Holders', header: ['Holder', 'Residence', 'Votes', 'Votes incl. rights', 'Board seats', 'Specified shareholder'], rows: r.control.holders.map((h) => [h.name, h.residency, pct(h.pctVotes), pct(h.pctVotesDeemed), h.boardSeats, h.specifiedShareholder ? 'yes' : 'no']) },
          { title: 'Loss risks', header: ['What could cause loss of CCPC status'], rows: r.control.lossRisks.map((x) => [x]) },
          { title: 'Evidence needed', header: ['Missing evidence'], rows: r.control.missingEvidence.map((x) => [x]) },
        ],
      };
    case 'nfp':
      return {
        ...base,
        title,
        summary: ['The Foundation is not assumed to be a registered charity or to be able to issue receipts. Relationships with the commercial operator must be at fair market value and serve the Foundation’s purposes.'],
        sections: [
          { title: 'Checks', header: ['Check', 'Status', 'Explanation'], rows: r.nfp.checks.map((c) => [c.label, c.status, c.plain]) },
          { title: 'Funding model', header: ['Year', 'Restricted grants', 'Unrestricted', 'Service fees', 'Donations', 'Program costs', 'Overhead', 'Surplus'], rows: r.nfp.years.map((y) => [y.year, d(y.restrictedGrants, y.year), d(y.unrestrictedFunding, y.year), d(y.serviceFees, y.year), d(y.donations, y.year), d(y.programCosts, y.year), d(y.overhead, y.year), d(y.surplus, y.year)]) },
          { title: 'Activities', header: ['Activity', 'How', 'Limits'], rows: r.nfp.examples.map((e) => [e.activity, e.how, e.limits]) },
        ],
      };
    case 'checklist':
      return {
        ...base,
        title,
        summary: [`${r.issues.filter((i) => i.professional).length} issues require professional validation.`],
        sections: [
          { title: 'Missing documents', header: ['Document', 'Status'], rows: MISSING_DOCS.map((x) => [x, 'Outstanding']) },
          { title: 'Professional review', header: ['Severity', 'Issue', 'Action'], rows: r.issues.filter((i) => i.professional).map((i) => [i.severity, i.title, i.resolution]) },
        ],
      };
    case 'recommended': {
      const ev = evaluateStructures(scn, DEFAULT_WEIGHTS);
      const rec = recommend(ev, DEFAULT_WEIGHTS);
      return {
        ...base,
        title,
        summary: [rec.headline, rec.whoBenefits, rec.taxes],
        sections: [
          { title: 'Why', header: ['Reason'], rows: rec.why.map((x) => [x]) },
          { title: 'Risks', header: ['Risk'], rows: rec.risks.map((x) => [x]) },
          { title: 'Competitive alternatives', header: ['Structure'], rows: rec.competitive.map((x) => [x]) },
          { title: 'Verify before proceeding', header: ['Action'], rows: rec.verify.map((x) => [x]) },
          { title: 'Evidence classes', header: ['Class', 'Items'], rows: [['Quantified', rec.quantified.join('; ')], ['Legal conditions', rec.legalConditions.join('; ')], ['Commercial assumptions', rec.commercialAssumptions.join('; ')], ['Unresolved', rec.unresolved.join('; ')], ['Professional validation', rec.professional.join('; ')]] },
        ],
      };
    }
  }
}
