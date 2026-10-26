import { useMemo, useState } from 'react';
import type { Scenario } from '../../types/domain';
import { applyKnobs, defaultKnobs, KNOB_LABEL, type Knobs } from '../../engines/scenarios/knobs';
import { computeScenario, type ScenarioResult } from '../../engines/scenarios/compute';
import { sum } from '../../engines/finance/finance';
import { Button, Card, Grid, Page, Pill, SelectField } from '../../components/ui';
import { useActive } from '../../hooks/useResult';
import { addScenario, getState, setUi, toast, useStore } from '../../state/store';
import { money, pct, multiple, toDisplay } from '../../utils/format';

interface Row {
  label: string;
  get: (r: ScenarioResult, s: Scenario) => number | null;
  kind: 'money' | 'pct' | 'multiple';
}

const ROWS: Row[] = [
  { label: 'Event revenue', get: (r) => sum(r.events.map((e) => e.revenueTotal)), kind: 'money' },
  { label: 'Operator EBITDA', get: (r, s) => sum((r.entityYears[s.roles.operator] ?? []).map((x) => x.ebitda)), kind: 'money' },
  { label: 'Operator net income', get: (r, s) => sum((r.entityYears[s.roles.operator] ?? []).map((x) => x.netIncome)), kind: 'money' },
  { label: 'Canadian corporate tax', get: (r) => r.group.canadianCorporateTax, kind: 'money' },
  { label: 'Withholding tax (final)', get: (r) => r.group.withholdingFinal, kind: 'money' },
  { label: 'U.S. tax', get: (r) => r.group.usTax, kind: 'money' },
  { label: 'Total tax', get: (r) => r.group.totalTax, kind: 'money' },
  { label: 'Group after-tax value', get: (r) => r.group.afterTaxValue, kind: 'money' },
  { label: 'Operator closing cash', get: (r, s) => (r.entityYears[s.roles.operator] ?? []).slice(-1)[0]?.closingCash ?? 0, kind: 'money' },
  { label: 'Peak funding need', get: (r) => r.peakFunding.amount, kind: 'money' },
  { label: 'Investor IRR', get: (r) => r.investor.irr, kind: 'pct' },
  { label: 'Investor MOIC', get: (r) => r.investor.moic, kind: 'multiple' },
  { label: 'Three X Global IRR', get: (r) => r.txgReturns.irr, kind: 'pct' },
];

export function WhatIfPage() {
  const { scn, result: base } = useActive();
  const cur = useStore((s) => s.currency);
  const [k, setK] = useState<Knobs>(() => defaultKnobs(scn));
  const [hist, setHist] = useState<Knobs[]>([]);
  const [fut, setFut] = useState<Knobs[]>([]);
  const [focus, setFocus] = useState(7);
  const set = <K extends keyof Knobs>(key: K, v: Knobs[K]) => {
    setHist((h) => [...h.slice(-49), k]);
    setFut([]);
    setK({ ...k, [key]: v });
  };
  const d0 = defaultKnobs(scn);
  const modified = useMemo(() => applyKnobs(scn, k), [scn, k]);
  const after = useMemo(() => computeScenario(modified, { skipComparison: true }), [modified]);
  const changed = (Object.keys(k) as (keyof Knobs)[]).filter((x) => JSON.stringify(k[x]) !== JSON.stringify(d0[x]));
  const attribution = useMemo(() => {
    const row = ROWS[focus];
    const b = row.get(base, scn) ?? 0;
    return changed.map((key) => {
      const s1 = applyKnobs(scn, k, key);
      const r1 = computeScenario(s1, { skipComparison: true });
      return { key, delta: (row.get(r1, s1) ?? 0) - b };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scn, k, focus]);
  const fmt = (v: number | null, kind: Row['kind']) => (kind === 'money' ? money(v === null ? null : toDisplay(v, cur, base), cur, { compact: true }) : kind === 'pct' ? (v === null ? 'undefined' : pct(v)) : multiple(v));
  const slider = (key: keyof Knobs, min: number, max: number, step: number, show: (v: number) => string, val: number) => (
    <label className="block text-[13px]">
      <div className="flex justify-between">
        <span className="font-medium">{KNOB_LABEL[key]}</span>
        <span className="tabular-nums muted">{show(val)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e: { target: HTMLInputElement }) => set(key, Number(e.target.value) as never)} className="mt-1 w-full" aria-label={KNOB_LABEL[key]} data-testid={`knob-${key}`} />
    </label>
  );
  const evOptions = [{ value: '', label: 'None' }, ...scn.events.flatMap((e) => e.years.map((y) => ({ value: `${e.id}:${y}`, label: `${e.name} — ${y}` })))];
  return (
    <Page
      title="What If?"
      subtitle="Move any assumption and see the result immediately. The base scenario is not changed until you save."
      actions={
        <>
          <Button icon="undo" onClick={() => hist.length && (setFut([k, ...fut]), setK(hist[hist.length - 1]), setHist(hist.slice(0, -1)))} disabled={!hist.length}>
            Undo
          </Button>
          <Button icon="redo" onClick={() => fut.length && (setHist([...hist, k]), setK(fut[0]), setFut(fut.slice(1)))} disabled={!fut.length}>
            Redo
          </Button>
          <Button icon="reset" onClick={() => (setHist([...hist, k]), setK(defaultKnobs(scn)))} data-testid="whatif-reset">
            Reset
          </Button>
          <Button
            variant="primary"
            icon="save"
            disabled={!changed.length}
            data-testid="whatif-save"
            onClick={() => {
              const id = addScenario({ ...modified, id: `${scn.id}-whatif`, name: `${scn.name} — what-if (${changed.map((c) => KNOB_LABEL[c]).join(', ')})`.slice(0, 120), baseline: 'custom' }, false);
              setUi({ compareIds: Array.from(new Set([...getState().compareIds, id])) });
              toast('Saved as a new scenario and added to Scenario Comparison.');
            }}
          >
            Save & compare
          </Button>
        </>
      }
    >
      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[360px_1fr]">
        <Card title="Assumptions">
          <div className="space-y-4">
            {slider('investmentScale', 0.25, 3, 0.05, (v) => `${(v * 100).toFixed(0)}%`, k.investmentScale)}
            <label className="block text-[13px]">
              <div className="flex justify-between">
                <span className="font-medium">{KNOB_LABEL.debtShare}</span>
                <span className="muted tabular-nums">{k.debtShare === null ? 'current structure' : `${pct(k.debtShare, 0)} debt / ${pct(1 - k.debtShare, 0)} equity`}</span>
              </div>
              <input type="range" min={-0.05} max={1} step={0.05} value={k.debtShare ?? -0.05} onChange={(e: { target: HTMLInputElement }) => set('debtShare', Number(e.target.value) < 0 ? null : Number(e.target.value))} className="mt-1 w-full" aria-label="Debt share" data-testid="knob-debtShare" />
            </label>
            {slider('txgEquityPct', 0.05, 0.6, 0.01, (v) => pct(v, 0), k.txgEquityPct)}
            <label className="flex items-center justify-between text-[13px]">
              <span className="font-medium">Three X Global shares carry votes</span>
              <input type="checkbox" checked={k.txgVoting} onChange={(e: { target: HTMLInputElement }) => set('txgVoting', e.target.checked)} />
            </label>
            {slider('loanRate', 0, 0.15, 0.0025, (v) => pct(v, 2), k.loanRate ?? 0.07)}
            {slider('loanTerm', 1, 7, 1, (v) => `${v} yrs`, k.loanTerm ?? 3)}
            {slider('sponsorshipMult', 0, 2, 0.05, (v) => `${(v * 100).toFixed(0)}%`, k.sponsorshipMult)}
            {slider('attendanceMult', 0.3, 1.6, 0.05, (v) => `${(v * 100).toFixed(0)}%`, k.attendanceMult)}
            {slider('priceMult', 0.5, 1.8, 0.05, (v) => `${(v * 100).toFixed(0)}%`, k.priceMult)}
            {slider('opexMult', 0.6, 1.6, 0.05, (v) => `${(v * 100).toFixed(0)}%`, k.opexMult)}
            {slider('fibaMult', 0, 2.5, 0.05, (v) => `${(v * 100).toFixed(0)}%`, k.fibaMult)}
            {slider('staffingMult', 0.5, 2, 0.05, (v) => `${(v * 100).toFixed(0)}%`, k.staffingMult)}
            {slider('fx', 1.1, 1.6, 0.01, (v) => v.toFixed(2), k.fx ?? scn.fx.cadPerUsd[scn.years[0]] ?? 1.35)}
            {slider('exitMultiple', 2, 16, 0.5, (v) => `${v}×`, k.exitMultiple)}
            <SelectField label="Small business deduction" value={k.sbd} options={[{ value: 'auto', label: 'Auto (from control analysis)' }, { value: 'assume-eligible', label: 'Assume eligible' }, { value: 'assume-ineligible', label: 'Assume not eligible' }]} onChange={(v) => set('sbd', v)} />
            <SelectField label="LLC classification" value={k.llc} options={[{ value: 'keep', label: 'Keep current' }, { value: 'unknown', label: 'Unknown' }, { value: 'disregarded', label: 'Disregarded' }, { value: 'partnership', label: 'Partnership' }, { value: 'corporation', label: 'Corporation' }]} onChange={(v) => set('llc', v)} />
            <label className="flex items-center justify-between text-[13px]">
              <span className="font-medium">Treaty benefits claimed</span>
              <input type="checkbox" checked={k.treaty} onChange={(e: { target: HTMLInputElement }) => set('treaty', e.target.checked)} />
            </label>
            <SelectField label="Number of events" value={k.events} options={[{ value: 'both', label: 'Men’s and women’s' }, { value: 'men', label: 'Men’s only' }, { value: 'women', label: 'Women’s only' }]} onChange={(v) => set('events', v)} />
            <SelectField label="Cancel an event" value={k.cancel} options={evOptions} onChange={(v) => set('cancel', v)} hint="Cancellation assumes 40% of costs are sunk and revenue is refunded." />
          </div>
        </Card>
        <div className="space-y-5">
          <Card title="Before → After" subtitle={changed.length ? `Changed: ${changed.map((c) => KNOB_LABEL[c]).join(', ')}` : 'No changes yet — move a slider.'}>
            <div className="overflow-x-auto">
            <table className="table" data-testid="whatif-table">
              <thead>
                <tr>
                  <th>Measure</th>
                  <th className="num">Before</th>
                  <th className="num">After</th>
                  <th className="num">Change</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => {
                  const b = row.get(base, scn);
                  const a = row.get(after, modified);
                  const delta = a !== null && b !== null ? a - b : null;
                  return (
                    <tr key={row.label} onClick={() => setFocus(i)} className="cursor-pointer" style={focus === i ? { background: 'var(--accent-soft)' } : undefined}>
                      <td>{row.label}</td>
                      <td className="num">{fmt(b, row.kind)}</td>
                      <td className="num font-semibold">{fmt(a, row.kind)}</td>
                      <td className="num" style={{ color: delta === null || Math.abs(delta) < 1e-9 ? undefined : delta > 0 === !row.label.includes('tax') && !row.label.includes('Peak') ? 'var(--good)' : 'var(--bad)' }}>
                        {delta === null ? '—' : row.kind === 'money' ? money(toDisplay(delta, cur, base), cur, { compact: true, sign: true }) : row.kind === 'pct' ? `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)} pts` : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}×`}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td>CCPC status</td>
                  <td className="num">
                    <Pill tone={base.control.status === 'likely-ccpc' ? 'good' : 'warn'}>{base.control.status}</Pill>
                  </td>
                  <td className="num">
                    <Pill tone={after.control.status === 'likely-ccpc' ? 'good' : after.control.status === 'uncertain' ? 'warn' : 'bad'}>{after.control.status}</Pill>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
            </div>
          </Card>
          <Card title={`What caused the change in “${ROWS[focus].label}”?`} subtitle="Each changed assumption applied on its own to the base scenario (interactions are not double-counted, so items may not sum exactly to the total).">
            {attribution.length ? (
              <Grid cols={2}>
                {attribution.map((a) => (
                  <div key={a.key} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: 'var(--card-2)' }}>
                    <span className="text-[14px]">{KNOB_LABEL[a.key]}</span>
                    <span className="num font-semibold" style={{ color: a.delta >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                      {ROWS[focus].kind === 'money' ? money(toDisplay(a.delta, cur, base), cur, { compact: true, sign: true }) : ROWS[focus].kind === 'pct' ? `${(a.delta * 100).toFixed(1)} pts` : a.delta.toFixed(2)}
                    </span>
                  </div>
                ))}
              </Grid>
            ) : (
              <p className="muted text-[14px]">Tap a row above to choose the measure, then change an assumption.</p>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
}
