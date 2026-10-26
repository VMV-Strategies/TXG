import { useState } from 'react';
import { Card, Grid, IssueList, Page, Segmented, Stat, StatusBadge, Term, Callout, ExplainButton } from '../../components/ui';
import { BarChart, LineChart } from '../../components/charts';
import { useActive } from '../../hooks/useResult';
import { useStore } from '../../state/store';
import { money, pct, toDisplay } from '../../utils/format';
import type { Metric } from '../../engines/explain/metrics';
import { sum } from '../../engines/finance/finance';

export function adhoc(id: string, label: string, value: number | null, opts: Partial<Metric> & { what: string; why?: string; watch?: string; taxes?: string; from?: string; to?: string; benefits?: string; pays?: string }): Metric {
  return {
    id,
    label,
    value,
    unit: opts.unit ?? 'money',
    currency: 'CAD',
    year: opts.year ?? 'all',
    status: opts.status ?? 'computed',
    formula: opts.formula ?? '',
    inputs: opts.inputs ?? [],
    sources: opts.sources ?? [],
    text: opts.text,
    explain: () => ({ what: opts.what, why: opts.why ?? '', from: opts.from ?? '', to: opts.to ?? '', benefits: opts.benefits ?? '', pays: opts.pays ?? '', taxes: opts.taxes ?? '', watch: opts.watch ?? '' }),
  };
}

export function OverviewPage() {
  const { scn, result: r, metrics: m } = useActive();
  const cur = useStore((s) => s.currency);
  const [view, setView] = useState<'annual' | 'monthly'>('annual');
  const op = scn.roles.operator;
  const opRows = r.entityYears[op] ?? [];
  const years = r.years.map(String);
  const d = (cad: number, y?: number) => toDisplay(cad, cur, r, y);
  const evRev = sum(r.events.map((e) => e.revenueTotal));
  const evCost = sum(r.events.map((e) => e.costTotal));
  const evEbitda = sum(r.events.map((e) => e.ebitda));
  const netIncome = sum(opRows.map((x) => x.netIncome));
  const opTax = sum(opRows.map((x) => x.incomeTax));
  const lastOp = opRows[opRows.length - 1];
  const txgIn = sum(r.flows.filter((f) => f.to === scn.roles.usVenture && scn.entities.find((e) => e.id === f.from)?.jurisdiction === 'CA').map((f) => f.net));
  const capOut = sum(r.flows.filter((f) => f.from === scn.roles.usVenture && f.capital && scn.entities.find((e) => e.id === f.to)?.jurisdiction === 'CA').map((f) => f.gross));
  const recovery = capOut ? txgIn / capOut : null;
  const monthlyBurn = lastOp ? Math.max(0, (lastOp.cashOut - lastOp.cashIn) / 12) : 0;
  const runway = monthlyBurn > 0 && lastOp ? lastOp.closingCash / monthlyBurn : null;
  const be = r.breakEven;
  const evMen = r.events.filter((e) => e.gender === 'men');
  const evWomen = r.events.filter((e) => e.gender === 'women');
  const monthly = r.monthly[op] ?? [];
  const extra: Metric[] = [
    adhoc('ev.revenue', 'Total event revenue', evRev, { what: 'All revenue from the modelled events across the period (cash and in-kind sponsorship).', formula: 'Σ event revenue', inputs: r.events.map((e) => ({ label: `${e.name} ${e.year}`, value: Math.round(e.revenueTotal) })), status: scn.baseline === 'workbook' ? 'workbook' : 'synthetic', why: 'Revenue determines whether events can sustain themselves.', watch: 'Unsigned sponsorship is probability-weighted (see Revenue & Sponsorship).' }),
    adhoc('ev.costs', 'Total event expenses', evCost, { what: 'All event costs including contingency, payroll contributions and in-kind costs.', formula: 'Σ event costs', inputs: r.events.map((e) => ({ label: `${e.name} ${e.year}`, value: Math.round(e.costTotal) })), status: scn.baseline === 'workbook' ? 'workbook' : 'synthetic' }),
    adhoc('ev.ebitda', 'Event profitability (EBITDA)', evEbitda, { what: 'Events’ revenue minus event costs, before corporate overhead, interest and tax.', formula: 'Σ (event revenue − event costs)', inputs: r.events.map((e) => ({ label: `${e.name} ${e.year}`, value: Math.round(e.ebitda) })) }),
    adhoc('op.net', `${scn.entities.find((e) => e.id === op)?.name} net income`, netIncome, { what: 'Profit after interest, fees and Canadian tax, summed over the period.', formula: 'Σ (income before tax − income tax)', inputs: opRows.map((x) => ({ label: `${x.year}`, value: Math.round(x.netIncome) })) }),
    adhoc('op.taxes', 'Canadian corporate tax (operator)', opTax, { what: 'Federal and Ontario income tax payable by the operator.', formula: 'Σ yearly corporate tax', inputs: opRows.map((x) => ({ label: `${x.year}`, value: Math.round(x.incomeTax) })), sources: [{ id: 'ita-123-1', label: 'ITA s. 123' }, { id: 'ita-125-1', label: 'ITA s. 125' }] }),
    adhoc('op.debt', 'Debt outstanding (end of period)', lastOp?.debtOutstanding ?? 0, { what: 'Loan principal still owed by the operator at the end of the period.', formula: 'Σ loan closing balances', year: r.years[r.years.length - 1] }),
    adhoc('op.interest', 'Interest expense (period)', r.totals.interest, { what: 'Interest the operator pays on its loans.', formula: 'Σ loan interest', sources: [{ id: 'ita-18-4', label: 'ITA s. 18(4)' }] }),
    adhoc('op.retained', 'Retained earnings (end of period)', lastOp?.retainedEarnings ?? 0, { what: 'Accumulated profits (or losses) kept in the operator after dividends.', formula: 'Σ net income − Σ dividends', year: r.years[r.years.length - 1] }),
    adhoc('op.cash', 'Operating cash available (end of period)', lastOp?.closingCash ?? 0, { what: 'Cash the operator holds at the end of the last year.', formula: 'Opening cash + inflows − outflows', year: r.years[r.years.length - 1], watch: (lastOp?.closingCash ?? 0) < 0 ? 'Negative: the plan is under-funded.' : '' }),
    adhoc('txg.recovery', 'Capital recovery by Three X Global', recovery, { unit: 'pct', what: 'Share of the capital sent to Canada that has come back as cash (interest, dividends, fees, repayments) by the end of the period.', formula: 'Σ net receipts from Canada ÷ Σ capital sent', inputs: [{ label: 'Capital sent', value: Math.round(capOut) }, { label: 'Received back (net)', value: Math.round(txgIn) }] }),
    adhoc('runway', 'Cash runway (months)', runway, { unit: 'count', what: 'How many months the operator’s closing cash lasts at the last year’s average net outflow.', formula: 'closing cash ÷ (net outflow ÷ 12)', watch: runway === null ? 'Not burning cash in the last year.' : '' }),
    adhoc('breakeven', `Additional net revenue needed to break even (${r.years[0]})`, be[0]?.allInGap ?? 0, { what: `At your estimated costs and sponsorship, you need this much more net ticket and sponsorship revenue in ${r.years[0]} to reach all-in break-even (after overhead, interest and fees).`, formula: 'max(0, −(event EBITDA − overhead − EHT − interest − fees))', inputs: be.map((b) => ({ label: `${b.year} all-in gap`, value: Math.round(b.allInGap) })), year: r.years[0] }),
  ];
  const X = Object.fromEntries(extra.map((x) => [x.id, x]));
  return (
    <Page
      title={scn.name}
      subtitle={
        <>
          {scn.description} <StatusBadge status={scn.baseline === 'workbook' ? 'workbook' : scn.baseline === 'synthetic' ? 'synthetic' : 'assumption'} />
        </>
      }
      actions={<Segmented label="View" value={view} onChange={setView} options={[{ value: 'annual', label: 'Annual' }, { value: 'monthly', label: `Monthly ${r.peakFunding.year}` }]} />}
    >
      {!r.reconciliation.ok ? (
        <Callout tone="bad" title="Reconciliation warning">
          Sources and uses do not balance: {r.reconciliation.checks.filter((c) => !c.ok).map((c) => c.label).join('; ')}.
        </Callout>
      ) : null}
      <Card>
        <Grid cols={4}>
          <Stat metric={m['capital.invested']} result={r} />
          <Stat metric={X['ev.revenue']} result={r} />
          <Stat metric={X['ev.ebitda']} result={r} />
          <Stat metric={m['group.totalTax']} result={r} />
          <Stat metric={m['investor.irr']} result={r} />
          <Stat metric={m['investor.moic']} result={r} />
          <Stat metric={m['funding.peak']} result={r} />
          <Stat metric={m['ccpc.status']} result={r} label="Canadian control (CCPC)" />
        </Grid>
      </Card>
      <Grid cols={2}>
        <Card title={view === 'annual' ? 'Operator revenue, costs and EBITDA' : `Monthly cash — ${scn.entities.find((e) => e.id === op)?.name} (${r.peakFunding.year})`} subtitle={view === 'annual' ? 'Event revenue and total costs (events + overhead) by year' : 'Closing cash and cumulative operating cash before financing'}>
          {view === 'annual' ? (
            <BarChart ariaLabel="Revenue, costs and EBITDA by year" categories={years} series={[{ name: 'Revenue', values: opRows.map((x) => d(x.eventRevenue, x.year)) }, { name: 'Costs', values: opRows.map((x) => d(x.eventCosts + x.overhead + x.eht, x.year)), color: 'var(--chart-2)' }, { name: 'EBITDA', values: opRows.map((x) => d(x.ebitda, x.year)), color: 'var(--chart-5)' }]} />
          ) : (
            <LineChart ariaLabel="Monthly cash" labels={['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']} series={[{ name: 'Closing cash', values: monthly.map((x) => d(x.closing, r.peakFunding.year)) }, { name: 'Cumulative before financing', values: monthly.map((x) => d(x.preFinancingCumulative, r.peakFunding.year)), color: 'var(--chart-6)' }]} />
          )}
        </Card>
        <Card title="Men’s vs women’s events" subtitle="Event EBITDA by year — modelled separately">
          <BarChart ariaLabel="Event EBITDA by gender" categories={years} series={[{ name: 'Men’s', values: r.years.map((y) => d(sum(evMen.filter((e) => e.year === y).map((e) => e.ebitda)), y)) }, { name: 'Women’s', values: r.years.map((y) => d(sum(evWomen.filter((e) => e.year === y).map((e) => e.ebitda)), y)), color: 'var(--chart-4)' }]} />
        </Card>
      </Grid>
      <Card title="Executive dashboard" subtitle="Every number opens a plain-English explanation with its calculation and sources.">
        <Grid cols={4}>
          <Stat metric={X['op.cash']} result={r} />
          <Stat metric={X['ev.costs']} result={r} />
          <Stat metric={X['op.net']} result={r} />
          <Stat metric={X['op.taxes']} result={r} />
          <Stat metric={m['withholding.total']} result={r} />
          <Stat metric={X['op.debt']} result={r} />
          <Stat metric={X['op.interest']} result={r} />
          <Stat metric={X['op.retained']} result={r} />
          <Stat metric={X['txg.recovery']} result={r} />
          <Stat metric={m['txg.irr']} result={r} label="Three X Global return (IRR)" />
          <Stat metric={X['runway']} result={r} />
          <Stat metric={X['breakeven']} result={r} />
        </Grid>
      </Card>
      <Card title="Financial statements by entity" subtitle={`Amounts in ${cur}. Internal transfers are shown per entity and eliminated in group totals.`} pad={false}>
        <div className="overflow-x-auto px-2 pb-3">
          <table className="table" data-testid="entity-statements">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Year</th>
                <th className="num">Revenue</th>
                <th className="num">EBITDA</th>
                <th className="num">Interest (net)</th>
                <th className="num">Fees / royalties (net)</th>
                <th className="num">Income before tax</th>
                <th className="num">Income tax</th>
                <th className="num">Net income</th>
                <th className="num">Closing cash</th>
              </tr>
            </thead>
            <tbody>
              {scn.entities
                .filter((e) => e.inGroup)
                .flatMap((e) =>
                  (r.entityYears[e.id] ?? []).map((x, i) => (
                    <tr key={e.id + x.year}>
                      <td className="font-medium">{i === 0 ? e.name : ''}</td>
                      <td>{x.year}</td>
                      <td className="num">{money(d(x.eventRevenue + x.grantsReceived, x.year), cur, { compact: true })}</td>
                      <td className="num">{money(d(x.ebitda, x.year), cur, { compact: true })}</td>
                      <td className="num">{money(d(x.interestIncome - x.interestExpense, x.year), cur, { compact: true })}</td>
                      <td className="num">{money(d(x.feesReceived + x.royaltiesReceived + x.revShareReceived + x.servicesReceived - x.feesPaid - x.royaltiesPaid - x.revSharePaid - x.servicesPaid, x.year), cur, { compact: true })}</td>
                      <td className="num">{money(d(x.incomeBeforeTax, x.year), cur, { compact: true })}</td>
                      <td className="num">{money(d(x.incomeTax, x.year), cur, { compact: true })}</td>
                      <td className="num">{money(d(x.netIncome, x.year), cur, { compact: true })}</td>
                      <td className="num" style={{ color: x.closingCash < 0 ? 'var(--bad)' : undefined }}>
                        {money(d(x.closingCash, x.year), cur, { compact: true })}
                      </td>
                    </tr>
                  )),
                )}
            </tbody>
          </table>
        </div>
      </Card>
      <Grid cols={2}>
        <Card title="Issues to resolve" subtitle="Legal, tax and data uncertainties flagged by the engines" actions={<a className="btn btn-ghost" href="#/recommendations">All</a>}>
          <IssueList issues={r.issues} limit={6} />
        </Card>
        <Card title="Group economics" subtitle="Combined result with internal transfers eliminated">
          <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-[14px]">
            <dt className="muted">External revenue</dt>
            <dd className="num">{money(d(r.group.externalRevenue), cur)}</dd>
            <dt className="muted">Group pre-tax result</dt>
            <dd className="num">{money(d(r.group.groupPreTax), cur)}</dd>
            <dt className="muted">
              Total tax (<Term t="Part XIII tax">incl. withholding</Term>)
            </dt>
            <dd className="num">{money(d(r.group.totalTax), cur)}</dd>
            <dt className="muted">After-tax value</dt>
            <dd className="num font-semibold">{money(d(r.group.afterTaxValue), cur)}</dd>
            <dt className="muted">Internal transfers eliminated</dt>
            <dd className="num">{money(d(r.group.eliminated), cur)}</dd>
            <dt className="muted">Effective leakage rate</dt>
            <dd className="num">{r.group.groupPreTax > 0 ? pct(r.group.leakageRate) : 'n/a (loss)'}</dd>
            {r.comparison ? (
              <>
                <dt className="muted">
                  Tax vs plain-equity structure <ExplainButton metric={adhoc('cmp', 'Structure tax effect', r.comparison.delta, { what: `Difference in total group tax compared with: ${r.comparison.label}.`, why: 'Shows whether the structure reduces total tax or merely shifts it between entities.', inputs: Object.entries(r.comparison.deltaByEntity).map(([k, v]) => ({ label: scn.entities.find((e) => e.id === k)?.name ?? k, value: Math.round(v) })), formula: 'Total tax (this structure) − total tax (neutral equity structure)' })} />
                </dt>
                <dd className="num">{money(d(r.comparison.delta), cur, { sign: true })}</dd>
              </>
            ) : null}
          </dl>
        </Card>
      </Grid>
    </Page>
  );
}
