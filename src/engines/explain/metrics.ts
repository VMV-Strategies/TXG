// Metric registry and deterministic explanations. Every significant number in the
// UI is a Metric built here from the single ScenarioResult. The three explanation
// modes only change wording and depth — never the value.
import type { DataStatus, Scenario, SourceRef } from '../../types/domain';
import type { ScenarioResult } from '../scenarios/compute';
import { sum } from '../finance/finance';

export type Mode = 'simple' | 'business' | 'expert';
export type Unit = 'money' | 'pct' | 'multiple' | 'count' | 'text';

export interface Explanation {
  what: string;
  why: string;
  from: string;
  to: string;
  benefits: string;
  pays: string;
  taxes: string;
  watch: string;
}

export interface Metric {
  id: string;
  label: string;
  value: number | null;
  text?: string;
  unit: Unit;
  currency: 'CAD';
  year: number | 'all';
  status: DataStatus | 'computed' | 'conditional';
  formula: string;
  inputs: { label: string; value: number | string }[];
  sources: SourceRef[];
  explain: (mode: Mode) => Explanation;
}

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-CA')}`;
const pctS = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);

function pick(mode: Mode, simple: string, business: string, expert: string) {
  return mode === 'simple' ? simple : mode === 'business' ? business : expert;
}

function dataStatus(scn: Scenario): DataStatus {
  return scn.baseline === 'workbook' ? 'workbook' : scn.baseline === 'synthetic' ? 'synthetic' : 'assumption';
}

export function buildMetrics(r: ScenarioResult, scn: Scenario): Record<string, Metric> {
  const m: Record<string, Metric> = {};
  const op = scn.roles.operator;
  const txg = scn.roles.usVenture;
  const opName = scn.entities.find((e) => e.id === op)?.name ?? 'the operator';
  const txgName = scn.entities.find((e) => e.id === txg)?.name ?? 'the U.S. venture';
  const opRows = r.entityYears[op] ?? [];
  const st = dataStatus(scn);
  const add = (x: Metric) => (m[x.id] = x);

  add({
    id: 'capital.invested',
    label: 'Capital invested in Canada',
    value: r.totals.capitalInvested,
    unit: 'money',
    currency: 'CAD',
    year: 'all',
    status: st,
    formula: 'Σ equity subscriptions + loan drawdowns + convertibles + capital contributions into the operator',
    inputs: r.flows.filter((f) => f.capital && f.to === op && f.kind !== 'principal').map((f) => ({ label: `${f.kind} ${f.year}`, value: Math.round(f.gross) })),
    sources: [],
    explain: (mode) => ({
      what: pick(mode, `The total money put into ${opName} as shares, loans or contributions.`, `Total external capital deployed into ${opName} over the horizon, by instrument.`, 'Sum of capital flows (equity, preferred, loan drawdowns, convertibles, contributions) with recipient = operator.'),
      why: pick(mode, 'It is the money the events can spend before they earn their own way.', 'Sets the funding runway and the base for investor returns.', 'Drives cash runway, thin-cap equity amount (for equity and contributed surplus), and investor cost base.'),
      from: txgName + ' and other investors shown on the Entity Map.',
      to: opName,
      benefits: `${opName} gets the cash to operate.`,
      pays: 'The investor parts with the money; loans must be repaid.',
      taxes: pick(mode, 'Putting money in is not taxable. What matters is how it comes back (interest, dividends, repayments).', 'Capital is not income; it creates paid-up capital, debt principal or cost base.', 'Equity creates PUC (s. 89(1)); loans create principal; contributions create contributed surplus — relevant to s. 18(4) equity amount.'),
      watch: 'Check that the amount matches signed documents and that the currency and FX used are right.',
    }),
  });

  for (const row of opRows) {
    const y = row.year;
    const evs = r.events.filter((e) => e.year === y && e.operatorId === op);
    add({
      id: `op.ebitda.${y}`,
      label: `${opName} EBITDA ${y}`,
      value: row.ebitda,
      unit: 'money',
      currency: 'CAD',
      year: y,
      status: st,
      formula: 'Event revenue − event costs − overhead − Employer Health Tax',
      inputs: [
        { label: 'Event revenue', value: Math.round(row.eventRevenue) },
        { label: 'Event costs', value: Math.round(row.eventCosts) },
        { label: 'Overhead', value: Math.round(row.overhead) },
        { label: 'Employer Health Tax', value: Math.round(row.eht) },
      ],
      sources: [{ id: 'ext-ontario-eht', label: 'Ontario EHT' }],
      explain: (mode) => ({
        what: pick(mode, 'Operating profit from running the events, before interest and taxes.', `Operating earnings of ${opName} from ${evs.length} event(s) after corporate overhead.`, 'EBITDA = Σ event revenue − Σ event costs (incl. contingency, in-kind, payroll contributions) − overhead − EHT.'),
        why: pick(mode, 'It shows whether the events themselves make money.', 'Primary driver of valuation (exit multiple) and debt capacity.', 'Used for the exit EV (multiple × EBITDA) and as the EIFEL adjusted-taxable-income proxy.'),
        from: 'Sponsors, ticket buyers, vendors and public funders.',
        to: 'Venue, FIBA, production, staff and other vendors.',
        benefits: row.ebitda >= 0 ? `${opName} keeps the operating surplus.` : 'No one — the events lose money this year.',
        pays: row.ebitda >= 0 ? 'Customers and sponsors fund it.' : `${opName}’s investors fund the shortfall.`,
        taxes: 'EBITDA is before tax; corporate tax is computed on taxable income after interest, fees and capital cost allowance.',
        watch: evs.some((e) => e.ebitda < 0) ? 'At least one event loses money; see the event P&L.' : 'Revenue relies on contracts not yet signed — check sponsorship status.',
      }),
    });
    add({
      id: `op.tax.${y}`,
      label: `${opName} corporate tax ${y}`,
      value: row.incomeTax,
      unit: 'money',
      currency: 'CAD',
      year: y,
      status: row.caTax?.verified ? 'legislation' : 'conditional',
      formula: row.caTax ? row.caTax.steps.map((s) => s.label).join(' → ') : 'n/a',
      inputs: (row.caTax?.steps ?? []).map((s) => ({ label: s.label, value: Math.round(s.value) })),
      sources: row.caTax?.sources ?? [],
      explain: (mode) => ({
        what: pick(mode, `Federal and Ontario income tax ${opName} is expected to pay for ${y}.`, `Combined federal/Ontario Part I tax on taxable income of ${money(row.caTax?.taxableIncome ?? 0)}.`, `Federal ${money(row.caTax?.federalTax ?? 0)} + Ontario ${money(row.caTax?.ontarioTax ?? 0)}; SBD income ${money(row.caTax?.sbdIncome ?? 0)}; loss pool closing ${money(row.caTax?.lossPoolClosing ?? 0)}.`),
        why: 'Tax reduces the cash available for reinvestment, repayment and dividends.',
        from: opName,
        to: 'Government of Canada and Ontario',
        benefits: 'Governments.',
        pays: opName,
        taxes: pick(mode, row.caTax?.sbdIncome ? 'Part of the income gets the lower small-business rate because the company appears to be Canadian-controlled.' : 'The lower small-business rate is not applied in this case.', `General rate ${pctS((row.caTax?.federalRateGeneral ?? 0) + (row.caTax?.ontarioRateGeneral ?? 0))}; small-business rate ${pctS((row.caTax?.federalRateSmall ?? 0) + (row.caTax?.ontarioRateSmall ?? 0))} on eligible income.`, (row.caTax?.notes ?? []).join(' ') || 'Rules verified for the year.'),
        watch: row.caTax?.verified ? 'Losses from early years reduce later tax only if the company keeps its losses (acquisition-of-control rules).' : 'Forecast year: rates assume current law continues.',
      }),
    });
  }

  const totalWh = r.group.withholdingFinal;
  add({
    id: 'withholding.total',
    label: 'Canadian withholding tax (final)',
    value: totalWh,
    unit: 'money',
    currency: 'CAD',
    year: 'all',
    status: 'computed',
    formula: 'Σ payment × applicable Part XIII rate (treaty-reduced where claimed and available)',
    inputs: r.flows.filter((f) => f.withholding > 0).map((f) => ({ label: `${f.kind} ${f.year}`, value: Math.round(f.withholding) })),
    sources: [{ id: 'ita-212-1', label: 'ITA s. 212' }, { id: 'tr-x-2a-5p', label: 'Treaty Art. X' }, { id: 'tr-xi-5p', label: 'Treaty Art. XI' }],
    explain: (mode) => ({
      what: pick(mode, 'Tax Canada keeps when money is paid out of Canada to Three X Global (or other non-residents).', 'Permanent Part XIII tax on cross-border dividends, interest, royalties and fees, net of treaty relief.', 'Applied rate = domestic 25% blended with the treaty rate for the treaty-eligible share (Art. IV(6) look-through for transparent LLCs).'),
      why: 'It reduces what the U.S. side actually receives; some can be credited against U.S. tax.',
      from: opName,
      to: 'Canada Revenue Agency (on behalf of the recipient)',
      benefits: 'Government of Canada.',
      pays: `Economically the recipient (${txgName}); legally ${opName} must withhold and remit.`,
      taxes: `Recoverable Reg. 105 amounts (${money(r.group.withholdingRecoverable)}) are shown separately as temporary cash withholding.`,
      watch: 'Treaty rates need residence, beneficial-ownership and LOB support (NR301/NR302). If the payer under-withholds it is liable.',
    }),
  });

  add({
    id: 'group.totalTax',
    label: 'Total group tax (Canada + U.S.)',
    value: r.group.totalTax,
    unit: 'money',
    currency: 'CAD',
    year: 'all',
    status: 'computed',
    formula: 'Canadian corporate tax + final withholding + U.S. tax (entity or member level)',
    inputs: [
      { label: 'Canadian corporate tax', value: Math.round(r.group.canadianCorporateTax) },
      { label: 'Final withholding', value: Math.round(r.group.withholdingFinal) },
      { label: 'U.S. tax', value: Math.round(r.group.usTax) },
    ],
    sources: [],
    explain: (mode) => ({
      what: pick(mode, 'All income taxes the group is expected to pay in both countries.', 'Combined tax leakage across entities and borders over the horizon.', 'Σ CA Part I (incl. branch tax) + Σ final Part XIII + Σ U.S. federal/NY (or member-level tax for pass-through).'),
      why: 'Comparing structures on this number shows whether a structure really saves tax or just moves it.',
      from: 'Group entities and members',
      to: 'Governments of Canada, Ontario, the United States and New York',
      benefits: 'Governments',
      pays: 'The group and its owners',
      taxes: r.comparison ? `Compared with a plain-equity structure, this structure changes total tax by ${money(r.comparison.delta)}.` : '',
      watch: 'Unquantified items (FIBA fee withholding, CFC inclusions, state taxes of members) are not included — see Issues.',
    }),
  });

  add({
    id: 'investor.irr',
    label: 'Investor IRR (pre-tax)',
    value: r.investor.irr,
    unit: 'pct',
    currency: 'CAD',
    year: 'all',
    status: 'computed',
    formula: 'IRR of investor cash flows: −investment, + distributions/interest, + exit proceeds',
    inputs: r.investor.flows.map((f) => ({ label: `${f.label} ${f.year}`, value: Math.round(f.amount) })),
    sources: [],
    explain: (mode) => ({
      what: pick(mode, 'The yearly return the private-equity investor would earn, given the timing of its money in and out.', 'Investor IRR in CAD terms from investment through exit.', `Annual-period IRR on ${r.investor.flows.length} cash flows; exit at EBITDA × ${scn.investor.exitMultiple}.`),
      why: 'Investors compare this to their target return.',
      from: txgName,
      to: 'Private equity investor',
      benefits: 'The investor, if positive.',
      pays: txgName,
      taxes: `After investor-level tax at the assumed ${pctS(scn.investor.investorTaxRate)}: ${pctS(r.investor.irrAfterTax)}.`,
      watch: r.investor.irr === null ? 'IRR is undefined because there is no return of cash in the horizon.' : 'Highly sensitive to the exit multiple and exit-year EBITDA.',
    }),
  });

  add({
    id: 'investor.moic',
    label: 'Investor MOIC',
    value: r.investor.moic,
    unit: 'multiple',
    currency: 'CAD',
    year: 'all',
    status: 'computed',
    formula: 'Σ cash returned ÷ Σ cash invested',
    inputs: [
      { label: 'Invested', value: Math.round(r.investor.invested) },
      { label: 'Distributions', value: Math.round(r.investor.distributions) },
      { label: 'Exit proceeds', value: Math.round(r.investor.exitProceeds) },
    ],
    sources: [],
    explain: (mode) => ({
      what: pick(mode, 'How many dollars the investor gets back for each dollar it puts in.', 'Gross multiple on invested capital.', 'MOIC = (distributions + exit proceeds) / investment, undiscounted.'),
      why: 'A quick check of total value created for the investor.',
      from: txgName,
      to: 'Investor',
      benefits: 'Investor',
      pays: txgName,
      taxes: 'Pre-tax at the investor level.',
      watch: 'Ignores timing — read alongside IRR.',
    }),
  });

  add({
    id: 'txg.irr',
    label: `${txgName} return on its Canadian investment`,
    value: r.txgReturns.irr,
    unit: 'pct',
    currency: 'CAD',
    year: 'all',
    status: 'computed',
    formula: 'IRR of capital sent to Canada vs. net receipts (after Canadian withholding) and exit value of Canadian holdings',
    inputs: r.txgReturns.flows.map((f) => ({ label: `${f.year}`, value: Math.round(f.amount) })),
    sources: [],
    explain: (mode) => ({
      what: pick(mode, `The yearly return ${txgName} earns on the money it sends into Canada.`, 'Project-level IRR for the U.S. venture’s Canadian position.', 'Flows: −capital out; + interest/dividends/fees net of Part XIII; + terminal value of shares, loans and contracts less illustrative U.S. tax on the gain.'),
      why: `Shows whether ${txgName}’s structure recovers its capital and shares in profits.`,
      from: opName,
      to: txgName,
      benefits: txgName,
      pays: opName,
      taxes: 'U.S. income tax on ongoing receipts is not deducted here; see Tax Intelligence.',
      watch: 'Terminal values are estimates.',
    }),
  });

  add({
    id: 'funding.peak',
    label: `Peak cash needed before financing (${r.peakFunding.year})`,
    value: r.peakFunding.amount,
    unit: 'money',
    currency: 'CAD',
    year: r.peakFunding.year,
    status: 'computed',
    formula: 'Most negative cumulative monthly operating cash flow before capital inflows',
    inputs: (r.monthly[op] ?? []).map((x) => ({ label: `Month ${x.month}`, value: Math.round(x.preFinancingCumulative) })),
    sources: [],
    explain: (mode) => ({
      what: pick(mode, 'The most money the operator needs to have in the bank before the event revenue arrives.', 'Peak monthly funding requirement for the operating year.', 'min over months of cumulative (inflows − capital inflows) − (outflows − capital outflows).'),
      why: 'Funding must arrive before costs are due — this is the minimum raise for the year, before any reserve.',
      from: 'Investors / lenders',
      to: opName,
      benefits: opName,
      pays: 'Investors',
      taxes: 'Not a tax item.',
      watch: r.peakFunding.month ? `The low point is in month ${r.peakFunding.month}. Sponsor payment timing and ticket presales move it.` : 'No negative point found.',
    }),
  });

  add({
    id: 'funding.cumulative',
    label: 'Cumulative operating cash need (all years)',
    value: r.cumulativeCashNeed,
    unit: 'money',
    currency: 'CAD',
    year: 'all',
    status: 'computed',
    formula: 'Most negative cumulative annual operating cash flow (excluding capital flows)',
    inputs: r.years.map((y) => ({ label: `${y}`, value: Math.round(sum(r.flows.filter((f) => f.year === y && f.to === op && !f.capital).map((f) => f.net)) - sum(r.flows.filter((f) => f.year === y && f.from === op && !f.capital).map((f) => f.gross))) })),
    sources: [],
    explain: (mode) => ({
      what: pick(mode, 'How much money the events need in total before they pay for themselves.', 'Total cash required to reach self-sustaining operations within the horizon.', 'max drawdown of cumulative non-capital operator cash flows.'),
      why: 'Compare with the planned investment to see if there is a funding gap.',
      from: 'Investors',
      to: opName,
      benefits: opName,
      pays: 'Investors',
      taxes: 'Includes corporate tax, interest and fees paid.',
      watch: r.cumulativeCashNeed > r.totals.capitalInvested ? 'Planned capital is below the cash need — a funding gap exists.' : 'Planned capital covers the modelled need, without a contingency reserve.',
    }),
  });

  add({
    id: 'ccpc.status',
    label: 'CCPC status',
    value: null,
    text: r.control.status === 'likely-ccpc' ? 'Appears to qualify' : r.control.status === 'uncertain' ? 'Uncertain' : 'Appears not to qualify',
    unit: 'text',
    currency: 'CAD',
    year: 'all',
    status: 'conditional',
    formula: 'Tests: private Canadian corporation; para. (a) control; para. (b) aggregation; de facto control; listing',
    inputs: r.control.tests.map((t) => ({ label: t.label, value: t.result })),
    sources: [{ id: 'ita-125-7-ccpc', label: 'ITA s. 125(7)' }, { id: 'ita-251-5', label: 'ITA s. 251(5)' }, { id: 'ita-256-5.1', label: 'ITA s. 256(5.1)' }],
    explain: () => ({
      what: `Whether ${opName} appears to be a Canadian-controlled private corporation on the facts entered.`,
      why: 'CCPC status unlocks the small business rate and other benefits; losing it raises Canadian tax.',
      from: 'Ownership and rights recorded on the Entity Map',
      to: '—',
      benefits: 'The company, if it qualifies.',
      pays: '—',
      taxes: r.control.statusPlain,
      watch: r.control.headroomPlain,
    }),
  });

  return m;
}
