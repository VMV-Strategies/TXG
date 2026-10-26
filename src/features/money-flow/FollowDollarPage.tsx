import { useEffect, useMemo, useState } from 'react';
import type { Scenario } from '../../types/domain';
import { applyPreset, type PresetId } from '../../engines/optimization/optimize';
import { computeScenario, type Flow } from '../../engines/scenarios/compute';
import { sum } from '../../engines/finance/finance';
import { Button, Card, NumberField, Page, Segmented, SourceLinks } from '../../components/ui';
import { Icon } from '../../components/icons';
import { useActive } from '../../hooks/useResult';
import { useStore } from '../../state/store';
import { money } from '../../utils/format';
import { nameOf } from './MoneyFlowPage';

type Arr = 'loan' | 'equity' | 'hybrid' | 'jv' | 'current';
const MAP: Record<Arr, PresetId> = { loan: 'A', equity: 'B', hybrid: 'C', jv: 'D', current: 'G' };

interface Step {
  title: string;
  text: string;
  from?: string;
  to?: string;
  amount: number;
  balances: Record<string, number>;
  sources?: Flow['sources'];
}

export function FollowDollarPage() {
  const { scn } = useActive();
  const cur = useStore((s) => s.currency);
  const [amount, setAmount] = useState(2_000_000);
  const [arr, setArr] = useState<Arr>('loan');
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(false);
  const variant: Scenario = useMemo(() => {
    const base: Scenario = structuredClone(scn);
    // scale Canadian capital to the chosen amount (CAD)
    const v = MAP[arr] === 'G' ? base : applyPreset(base, MAP[arr]);
    const txg = v.roles.usVenture;
    const caps = v.relationships.filter((r) => r.from === txg && v.entities.find((e) => e.id === r.to)?.jurisdiction === 'CA' && ['intercompany-loan', 'common-shares', 'preferred-shares', 'convertible', 'capital-contribution'].includes(r.type));
    const fx = v.fx.cadPerUsd[v.years[0]] ?? 1.35;
    const total = sum(caps.map((r) => (r.currency === 'USD' ? r.amount * fx : r.amount))) || 1;
    for (const r of caps) r.amount *= amount / total;
    return v;
  }, [scn, arr, amount]);
  const r = useMemo(() => computeScenario(variant, { skipComparison: true }), [variant]);
  const y0 = r.years[0];
  const op = variant.roles.operator;
  const txg = variant.roles.usVenture;
  const steps: Step[] = useMemo(() => {
    const bal: Record<string, number> = { [variant.roles.investor]: 0, [txg]: 0, [op]: 0, gov: 0 };
    const out: Step[] = [];
    const nm = (id: string) => nameOf(id, variant.entities);
    const push = (s: Omit<Step, 'balances'>, apply: () => void) => {
      apply();
      out.push({ ...s, balances: { ...bal } });
    };
    const peIn = r.flows.filter((f) => f.from === variant.roles.investor && f.to === txg && f.capital);
    for (const f of peIn) push({ title: 'The investor funds Three X Global', text: `${nm(f.from)} invests ${money(f.gross)} in ${nm(txg)} (${f.kind.replace('-', ' ')}). Three X Global now has the cash; the investor owns a share of Three X Global’s future results.`, from: f.from, to: txg, amount: f.gross, sources: f.sources }, () => (bal[txg] += f.gross));
    const cap = r.flows.filter((f) => f.from === txg && f.to === op && f.capital && f.year === y0);
    for (const f of cap) {
      const what = f.kind === 'loan-drawdown' ? `as a loan. ${nm(op)} now has ${money(f.gross)} in cash but owes that amount back with interest.` : f.kind === 'equity' || f.kind === 'preferred-equity' ? `for shares. Nothing has to be repaid, but ${nm(txg)} now owns part of ${nm(op)} and shares in its profits.` : f.kind === 'convertible' ? 'as a convertible loan — debt today, possibly shares later.' : 'as a funding contribution under a commercial agreement. Its tax character is unresolved.';
      push({ title: 'Money moves into Canada', text: `${nm(txg)} has transferred ${money(f.gross)} to ${nm(op)} ${what}`, from: txg, to: op, amount: f.gross, sources: f.sources }, () => ((bal[txg] -= f.gross), (bal[op] += f.gross)));
    }
    const costs = r.flows.filter((f) => f.from === op && f.year === y0 && (f.kind === 'event-cost' || f.kind === 'payroll'));
    const prod = sum(costs.filter((f) => f.kind === 'event-cost').map((f) => f.gross));
    push({ title: 'The events spend money', text: `${nm(op)} spends ${money(prod)} on FIBA fees, venue, production, travel and other contracted event costs in ${y0}. Its available cash decreases by ${money(prod)}.`, from: op, to: 'vendors', amount: prod }, () => (bal[op] -= prod));
    const pay = sum(costs.filter((f) => f.kind === 'payroll').map((f) => f.gross));
    if (pay) push({ title: 'Staff are paid', text: `${money(pay)} goes to staff and contractors, including employer CPP and EI contributions.`, from: op, to: 'staff', amount: pay }, () => (bal[op] -= pay));
    const spons = sum(r.flows.filter((f) => f.to === op && f.year === y0 && f.kind === 'sponsorship').map((f) => f.net));
    push({ title: 'Sponsors pay', text: `${nm(op)} receives ${money(spons)} from sponsors. Its cash increases, but the accounting and tax treatment depend on the agreement and timing — cash received before the event is deferred revenue, and HST is collected on top.`, from: 'sponsors', to: op, amount: spons }, () => (bal[op] += spons));
    const tix = sum(r.flows.filter((f) => f.to === op && f.year === y0 && (f.kind === 'tickets' || f.kind === 'other-revenue' || f.kind === 'public-funding')).map((f) => f.net));
    push({ title: 'Fans, vendors and public funders pay', text: `Tickets, hospitality, food, merchandise, vendor fees and public funding bring in ${money(tix)}.`, from: 'fans', to: op, amount: tix }, () => (bal[op] += tix));
    const oh = sum(r.flows.filter((f) => f.from === op && f.year === y0 && f.kind === 'overhead').map((f) => f.gross));
    if (oh) push({ title: 'Running the company', text: `${money(oh)} of corporate overhead (people, rent, professional fees).`, from: op, to: 'vendors', amount: oh }, () => (bal[op] -= oh));
    for (const f of r.flows.filter((f) => f.from === op && f.to === txg && !f.capital && f.year === y0)) {
      push(
        { title: `${f.kind === 'interest' ? 'Interest' : f.kind === 'dividend' ? 'A dividend' : 'A fee'} goes back to the U.S.`, text: `${nm(op)} pays ${money(f.gross)} of ${f.kind.replace('-', ' ')} to ${nm(txg)}. ${f.withholding ? `Canada keeps ${money(f.withholding)} as withholding tax, so ${nm(txg)} receives ${money(f.net)}.` : 'No Canadian withholding applies on these facts (treaty or domestic exemption).'} ${f.withholdingDetail?.basis ?? ''}`, from: op, to: txg, amount: f.gross, sources: f.sources },
        () => ((bal[op] -= f.gross), (bal[txg] += f.net), (bal.gov += f.withholding)),
      );
    }
    const tax = sum(r.flows.filter((f) => f.from === op && f.year === y0 && f.kind === 'tax').map((f) => f.gross));
    push({ title: 'Canadian taxes', text: tax ? `${nm(op)} pays ${money(tax)} of Canadian taxes for ${y0} (income tax and Employer Health Tax).` : `${nm(op)} owes no Canadian income tax for ${y0} on these numbers (for example because of a loss, which can be carried forward).`, from: op, to: 'gov', amount: tax }, () => ((bal[op] -= tax), (bal.gov += tax)));
    // Later years summary
    const later = r.years.slice(1);
    if (later.length) {
      const back = sum(r.flows.filter((f) => f.from === op && f.to === txg && later.includes(f.year)).map((f) => f.net));
      const wh = sum(r.flows.filter((f) => f.from === op && f.to === txg && later.includes(f.year)).map((f) => f.withholding));
      const opNet = sum(r.flows.filter((f) => later.includes(f.year) && f.to === op).map((f) => f.net)) - sum(r.flows.filter((f) => later.includes(f.year) && f.from === op && f.to !== txg).map((f) => f.gross));
      push({ title: `${later[0]}–${later[later.length - 1]}: the business runs`, text: `Over the following years ${nm(op)}’s own operations ${opNet >= 0 ? 'add' : 'use'} ${money(Math.abs(opNet))} of cash, and it pays ${money(back + wh)} to ${nm(txg)} (interest, dividends, fees and repayments), of which Canada withholds ${money(wh)}.`, from: op, to: txg, amount: back }, () => ((bal[op] += opNet - back - wh), (bal[txg] += back), (bal.gov += wh)));
    }
    const ex = r.txgReturns.exitProceeds;
    push({ title: 'The end of the period', text: `If the project is valued at ${variant.investor.exitMultiple}× EBITDA in ${variant.investor.exitYear}, ${nm(txg)}’s Canadian position is worth about ${money(ex)} (shares, loans still owed and contracts, less illustrative U.S. tax on the gain). The investor’s share of Three X Global’s value gives an IRR of ${r.investor.irr === null ? 'undefined (no positive return)' : `${(r.investor.irr * 100).toFixed(1)}%`}.`, from: op, to: txg, amount: ex }, () => (bal[txg] += ex));
    return out;
  }, [r, variant, op, txg, y0]);
  useEffect(() => {
    setI(0);
  }, [arr, amount]);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setI((x) => (x + 1 < steps.length ? x + 1 : (setAuto(false), x))), 2600);
    return () => clearInterval(t);
  }, [auto, steps.length]);
  const st = steps[Math.min(i, steps.length - 1)];
  const nodes = [
    { id: variant.roles.investor, label: 'Investor', x: 8 },
    { id: txg, label: 'Three X Global', x: 33 },
    { id: op, label: variant.entities.find((e) => e.id === op)?.name ?? 'Operator', x: 62 },
    { id: 'gov', label: 'Governments', x: 90 },
  ];
  const xOf = (id?: string) => nodes.find((n) => n.id === id)?.x ?? (id === 'sponsors' || id === 'fans' ? 62 : id === 'vendors' || id === 'staff' ? 90 : 50);
  return (
    <Page title="Follow the Dollar" subtitle="Enter an amount and a financing method, then step through what happens to the money — with the real numbers from the model.">
      <Card>
        <div className="grid items-end gap-4 md:grid-cols-[220px_1fr_auto]">
          <NumberField label="Amount sent to Canada (CAD)" value={amount} onChange={(v) => setAmount(Math.max(10000, v))} testId="ftd-amount" />
          <Segmented label="Arrangement" value={arr} onChange={setArr} options={[{ value: 'loan', label: 'Loan' }, { value: 'equity', label: 'Equity' }, { value: 'hybrid', label: 'Hybrid' }, { value: 'jv', label: 'Joint venture' }, { value: 'current', label: 'Current' }]} />
          <Button icon="play" variant="primary" onClick={() => (setI(0), setAuto(true))}>
            Play
          </Button>
        </div>
      </Card>
      <Card>
        <div className="relative h-40 w-full" aria-hidden="true">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            {st?.from !== undefined && st?.to !== undefined ? <path d={`M${xOf(st.from)},20 C${(xOf(st.from) + xOf(st.to)) / 2},${st.from === st.to ? 2 : 6} ${(xOf(st.from) + xOf(st.to)) / 2},6 ${xOf(st.to)},20`} fill="none" stroke="var(--accent)" strokeWidth="0.8" className="flow-dash" vectorEffect="non-scaling-stroke" /> : null}
          </svg>
          {nodes.map((n) => (
            <div key={n.id} className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center" style={{ left: `${n.x}%` }}>
              <div className="flex h-14 w-14 items-center justify-center rounded-full text-[11px] font-semibold shadow-sm transition-all" style={{ background: st && (st.from === n.id || st.to === n.id) ? 'var(--accent)' : 'var(--card-2)', color: st && (st.from === n.id || st.to === n.id) ? '#fff' : 'var(--ink-2)', border: '1px solid var(--line)' }}>
                <Icon name={n.id === 'gov' ? 'tax' : 'dollar'} size={20} />
              </div>
              <div className="text-[11px] font-medium leading-tight">{n.label}</div>
              <div className="text-[11px] tabular-nums muted">{money(st?.balances[n.id] ?? 0, 'CAD', { compact: true })}</div>
            </div>
          ))}
        </div>
      </Card>
      {st ? (
        <Card title={`Step ${i + 1} of ${steps.length}: ${st.title}`}>
          <p className="text-[17px] leading-relaxed" data-testid="ftd-text">
            {st.text}
          </p>
          {st.sources?.length ? (
            <div className="mt-3">
              <SourceLinks refs={st.sources} />
            </div>
          ) : null}
          <div className="mt-4 flex items-center justify-between">
            <Button icon="prev" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>
              Back
            </Button>
            <div className="flex gap-1">
              {steps.map((_, k) => (
                <button key={k} type="button" aria-label={`Step ${k + 1}`} onClick={() => setI(k)} className="h-2 w-2 rounded-full" style={{ background: k === i ? 'var(--accent)' : 'var(--line-2)' }} />
              ))}
            </div>
            <Button icon="next" variant="primary" onClick={() => setI(Math.min(steps.length - 1, i + 1))} disabled={i >= steps.length - 1} data-testid="ftd-next">
              Next
            </Button>
          </div>
          <p className="muted mt-3 text-[12px]">Balances shown are cumulative cash movements in CAD for this walk-through (display currency: {cur}). The model’s full statements are on the Overview.</p>
        </Card>
      ) : null}
    </Page>
  );
}
