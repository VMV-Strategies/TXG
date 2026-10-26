import { useMemo, useState } from 'react';
import { Sankey, type SankeyLinkIn, type SankeyNodeIn } from '../../components/charts';
import { Callout, Card, Page, Segmented, SelectField, StatusBadge } from '../../components/ui';
import { openOverlay } from '../../components/overlay';
import { useActive } from '../../hooks/useResult';
import { updateScenario, useStore } from '../../state/store';
import { money, toDisplay } from '../../utils/format';
import { sum } from '../../engines/finance/finance';
import type { Flow, FlowKind } from '../../engines/scenarios/compute';

export const CATEGORY: Record<FlowKind, 'capital' | 'revenue' | 'costs' | 'returns' | 'taxes' | 'grants'> = {
  equity: 'capital',
  'preferred-equity': 'capital',
  'loan-drawdown': 'capital',
  convertible: 'capital',
  'capital-contribution': 'capital',
  principal: 'capital',
  'exit-proceeds': 'capital',
  interest: 'returns',
  dividend: 'returns',
  'deemed-dividend': 'returns',
  'management-fee': 'returns',
  royalty: 'returns',
  'revenue-share': 'returns',
  'guarantee-fee': 'returns',
  distribution: 'returns',
  'service-fee': 'costs',
  grant: 'grants',
  donation: 'grants',
  'restricted-funding': 'grants',
  sponsorship: 'revenue',
  tickets: 'revenue',
  'other-revenue': 'revenue',
  'public-funding': 'revenue',
  'event-cost': 'costs',
  payroll: 'costs',
  overhead: 'costs',
  tax: 'taxes',
};
const CAT_COLOR = { capital: 'var(--chart-1)', revenue: 'var(--chart-5)', costs: 'var(--chart-2)', returns: 'var(--chart-4)', taxes: 'var(--chart-6)', grants: 'var(--chart-3)' };
const CAT_LABEL = { capital: 'Capital (equity, loans, repayments)', revenue: 'Revenue', costs: 'Costs', returns: 'Interest, dividends, fees', taxes: 'Taxes', grants: 'Grants & donations' };

export function nameOf(id: string, ents: { id: string; name: string }[]) {
  const e = ents.find((x) => x.id === id);
  if (e) return e.name;
  const m: Record<string, string> = { 'gov-ca': 'Governments of Canada / Ontario', 'gov-us': 'U.S. federal & NY governments', 'gov-us-members': 'U.S. tax (members)', 'ext-us-vendors': 'U.S. vendors & staff' };
  return m[id] ?? id.replace(/^ext-/, '').replace(/-/g, ' ');
}

export function MoneyFlowPage() {
  const { scn, result: r } = useActive();
  const cur = useStore((s) => s.currency);
  const [year, setYear] = useState<string>(String(r.years[0]));
  const [cats, setCats] = useState<string>('all');
  const [kindFilter, setKindFilter] = useState<string>('');
  const flows = useMemo(() => r.flows.filter((f) => (year === 'all' || f.year === Number(year)) && (cats === 'all' || CATEGORY[f.kind] === cats)), [r.flows, year, cats]);
  const d = (n: number, y?: number) => toDisplay(n, cur, r, y ?? (year === 'all' ? 'all' : Number(year)));
  const { nodes, links } = useMemo(() => {
    const ns = new Map<string, SankeyNodeIn>();
    const agg = new Map<string, SankeyLinkIn & { flows: Flow[] }>();
    for (const f of flows) {
      const a = `${f.from}::out`;
      const b = `${f.to}::in`;
      ns.set(a, { id: a, name: nameOf(f.from, scn.entities), color: 'var(--ink-2)' });
      ns.set(b, { id: b, name: nameOf(f.to, scn.entities), color: 'var(--ink-2)' });
      const cat = CATEGORY[f.kind];
      const key = `${a}|${b}|${cat}`;
      const cur0 = agg.get(key) ?? { source: a, target: b, value: 0, label: CAT_LABEL[cat], color: CAT_COLOR[cat], internal: f.internal, flows: [] };
      cur0.value += f.gross;
      cur0.flows.push(f);
      agg.set(key, cur0);
    }
    const links = [...agg.values()].map((l) => ({ ...l, value: Math.max(0, d(l.value)), onClick: () => openOverlay({ kind: 'flow', flow: l.flows.sort((x, y) => y.gross - x.gross)[0] }) }));
    return { nodes: [...ns.values()], links };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flows, scn.entities, cur]);

  const op = scn.roles.operator;
  const yearsSel = year === 'all' ? r.years : [Number(year)];
  const opFlows = r.flows.filter((f) => yearsSel.includes(f.year) && (f.from === op || f.to === op));
  const S = (pred: (f: Flow) => boolean, dir: 'in' | 'out') => sum(opFlows.filter((f) => (dir === 'in' ? f.to === op : f.from === op) && pred(f)).map((f) => (dir === 'in' ? f.net : f.gross)));
  const sources: [string, number][] = [
    ['Equity and contributions', S((f) => ['equity', 'preferred-equity', 'capital-contribution'].includes(f.kind), 'in')],
    ['Loans and convertibles', S((f) => ['loan-drawdown', 'convertible'].includes(f.kind), 'in')],
    ['Sponsorship', S((f) => f.kind === 'sponsorship', 'in')],
    ['Tickets, hospitality, F&B, merchandise', S((f) => f.kind === 'tickets', 'in')],
    ['Vendor, media and other revenue', S((f) => f.kind === 'other-revenue', 'in')],
    ['Public funding and grants', S((f) => ['public-funding', 'grant', 'donation', 'restricted-funding'].includes(f.kind), 'in')],
    ['Other receipts', S((f) => ['service-fee', 'interest', 'dividend', 'management-fee', 'royalty', 'revenue-share'].includes(f.kind), 'in')],
  ];
  const uses: [string, number][] = [
    ['Event costs (venue, production, FIBA, vendors)', S((f) => f.kind === 'event-cost' && !f.capital, 'out')],
    ['Staff and contractors', S((f) => f.kind === 'payroll', 'out')],
    ['Corporate overhead', S((f) => f.kind === 'overhead', 'out')],
    ['Capital expenditure', S((f) => f.kind === 'event-cost' && f.capital, 'out')],
    ['Interest', S((f) => f.kind === 'interest', 'out')],
    ['Fees, royalties and profit shares', S((f) => ['management-fee', 'royalty', 'revenue-share', 'service-fee', 'guarantee-fee'].includes(f.kind), 'out')],
    ['Dividends', S((f) => f.kind === 'dividend', 'out')],
    ['Loan repayments', S((f) => f.kind === 'principal', 'out')],
    ['Taxes (income tax, EHT)', S((f) => f.kind === 'tax', 'out')],
  ];
  const rows = r.entityYears[op] ?? [];
  const sel = rows.filter((x) => yearsSel.includes(x.year));
  const cashChange = sel.length ? sel[sel.length - 1].closingCash - sel[0].openingCash : 0;
  const tS = sum(sources.map((x) => x[1]));
  const tU = sum(uses.map((x) => x[1]));
  const diff = tS - tU - cashChange;
  const list = flows.filter((f) => !kindFilter || f.kind === kindFilter).sort((a, b) => b.gross - a.gross);
  return (
    <Page title="Money Flow" subtitle="Every dollar between entities. Payers on the left, recipients on the right; tap a band to inspect the transaction. Internal transfers are fainter — they move money inside the group and are not new profit.">
      <Card
        actions={
          <>
            <Segmented label="Year" value={year} onChange={setYear} options={[...r.years.map((y) => ({ value: String(y), label: String(y) })), { value: 'all', label: 'All' }]} />
            <SelectField label="Show" value={cats} onChange={setCats} options={[{ value: 'all', label: 'All flows' }, ...Object.entries(CAT_LABEL).map(([v, l]) => ({ value: v, label: l }))]} />
          </>
        }
        title={`Flows ${year === 'all' ? `${r.years[0]}–${r.years[r.years.length - 1]}` : year} (${cur})`}
        subtitle={
          <>
            FX: {scn.fx.mode === 'forecast' ? 'scenario forecast rates' : 'transaction-date rates where recorded'} ·{' '}
            <button type="button" className="text-[var(--accent)]" onClick={() => updateScenario((s) => void (s.fx.mode = s.fx.mode === 'forecast' ? 'transaction' : 'forecast'))}>
              switch to {scn.fx.mode === 'forecast' ? 'transaction-date' : 'forecast'} FX
            </button>
          </>
        }
      >
        <div className="mb-2 flex flex-wrap gap-3 text-[12px] muted">
          {Object.entries(CAT_LABEL).map(([k, l]) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded" style={{ background: CAT_COLOR[k as keyof typeof CAT_COLOR] }} />
              {l}
            </span>
          ))}
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <Sankey nodes={nodes} links={links} ariaLabel="Money flow Sankey diagram" height={Math.max(360, nodes.length * 26)} />
          </div>
        </div>
      </Card>
      <Card title="Sources vs uses — operator" subtitle={`${scn.entities.find((e) => e.id === op)?.name}, ${year === 'all' ? 'all years' : year}. Must balance to the change in cash.`}>
        {Math.abs(diff) > 0.5 ? (
          <Callout tone="bad" title="Reconciliation failed">
            Sources − uses − change in cash = {money(d(diff), cur)}. Review the flows below.
          </Callout>
        ) : (
          <Callout tone="good" title="Balanced">
            Every dollar in is matched by a dollar out or by the change in cash.
          </Callout>
        )}
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <table className="table">
            <thead>
              <tr>
                <th>Sources</th>
                <th className="num">{cur}</th>
              </tr>
            </thead>
            <tbody>
              {sources.map(([l, v]) => (
                <tr key={l}>
                  <td>{l}</td>
                  <td className="num">{money(d(v), cur)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Total sources</td>
                <td className="num">{money(d(tS), cur)}</td>
              </tr>
            </tbody>
          </table>
          <table className="table">
            <thead>
              <tr>
                <th>Uses</th>
                <th className="num">{cur}</th>
              </tr>
            </thead>
            <tbody>
              {uses.map(([l, v]) => (
                <tr key={l}>
                  <td>{l}</td>
                  <td className="num">{money(d(v), cur)}</td>
                </tr>
              ))}
              <tr>
                <td>Increase (decrease) in cash</td>
                <td className="num">{money(d(cashChange), cur)}</td>
              </tr>
              <tr className="font-semibold">
                <td>Total uses + cash change</td>
                <td className="num">{money(d(tU + cashChange), cur)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Transactions" subtitle={`${list.length} payments · tap for amount, parties, legal basis, accounting and tax treatment`} actions={<SelectField label="Type" value={kindFilter} onChange={setKindFilter} options={[{ value: '', label: 'All types' }, ...Array.from(new Set(flows.map((f) => f.kind))).map((k) => ({ value: k, label: k.replace(/-/g, ' ') }))]} />} pad={false}>
        <div className="max-h-[60dvh] overflow-auto px-2 pb-2">
          <table className="table" data-testid="flow-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>From</th>
                <th>To</th>
                <th>Type</th>
                <th className="num">Gross</th>
                <th className="num">Withheld</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 400).map((f) => (
                <tr key={f.id} className="cursor-pointer" onClick={() => openOverlay({ kind: 'flow', flow: f })} style={f.internal ? { opacity: 0.85 } : undefined}>
                  <td>{f.year}</td>
                  <td>{nameOf(f.from, scn.entities)}</td>
                  <td>{nameOf(f.to, scn.entities)}</td>
                  <td>
                    {f.kind.replace(/-/g, ' ')}
                    {f.internal ? <span className="muted"> · internal</span> : null}
                  </td>
                  <td className="num">{money(d(f.gross, f.year), cur, { compact: true })}</td>
                  <td className="num">{f.withholding ? money(d(f.withholding, f.year), cur, { compact: true }) : '—'}</td>
                  <td>
                    <StatusBadge status={f.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}
