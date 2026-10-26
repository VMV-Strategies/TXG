import { useMemo, useState } from 'react';
import type { Scenario } from '../../types/domain';
import { evaluateStructures, OBJECTIVES, type ObjectiveId, type StructureEval } from '../../engines/optimization/optimize';
import { DEFAULT_WEIGHTS } from '../../data/constants';
import { resultFor } from '../../hooks/useResult';
import { Button, Callout, Card, Page, Pill, Segmented } from '../../components/ui';
import { useActive } from '../../hooks/useResult';
import { addScenario, deleteScenario, duplicateScenario, setActive, setUi, toast, useStore } from '../../state/store';
import { money, multiple, pct, toDisplay } from '../../utils/format';
import { sum } from '../../engines/finance/finance';
import type { ScenarioResult } from '../../engines/scenarios/compute';


function compliance(s: Scenario): number {
  // Illustrative annual compliance cost assumption by structure complexity (not a quote).
  const cross = s.relationships.filter((r) => s.entities.find((e) => e.id === r.from)?.jurisdiction !== s.entities.find((e) => e.id === r.to)?.jurisdiction && ['intercompany-loan', 'management-agreement', 'license', 'jv', 'revenue-share', 'common-shares', 'preferred-shares', 'convertible'].includes(r.type)).length;
  const caCorps = s.entities.filter((e) => e.inGroup && e.kind === 'ca-corp').length;
  return (20000 + cross * 8000 + caCorps * 12000) * s.years.length;
}

export function ComparePage() {
  const { scn } = useActive();
  const cur = useStore((s) => s.currency);
  const [tab, setTab] = useState<'scenarios' | 'optimizer'>('optimizer');
  return (
    <Page title="Scenario Comparison" subtitle="Compare saved scenarios side by side, or rank financing structures against your priorities." actions={<Segmented label="View" value={tab} onChange={setTab} options={[{ value: 'optimizer', label: 'Optimizer' }, { value: 'scenarios', label: 'Saved scenarios' }]} />}>
      {tab === 'optimizer' ? <Optimizer base={scn} cur={cur} /> : <SavedCompare cur={cur} />}
    </Page>
  );
}

function Optimizer({ base, cur }: { base: Scenario; cur: 'CAD' | 'USD' }) {
  const [w, setW] = useState<Record<ObjectiveId, number>>(DEFAULT_WEIGHTS);
  const [axes, setAxes] = useState<[ObjectiveId, ObjectiveId]>(['minTax', 'investorReturn']);
  const evals = useMemo(() => evaluateStructures(base, w), [base, w]);
  const top = evals[0];
  const d = (n: number) => toDisplay(n, cur, top.result);
  return (
    <>
      <Card title="Your priorities" subtitle="Weights from 0 (ignore) to 5 (most important). Rankings recompute instantly.">
        <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {OBJECTIVES.map((o) => (
            <label key={o.id} className="block text-[13px]">
              <div className="flex justify-between">
                <span className="font-medium">{o.label}</span>
                <span className="muted tabular-nums">{w[o.id]}</span>
              </div>
              <input type="range" min={0} max={5} step={1} value={w[o.id]} onChange={(e: { target: HTMLInputElement }) => setW({ ...w, [o.id]: Number(e.target.value) })} className="mt-1 w-full" aria-label={o.label} data-testid={`weight-${o.id}`} />
            </label>
          ))}
        </div>
      </Card>
      <Callout tone="info" title="How to read the ranking">
        Scores are a weighted sum of each structure’s position (0–1) among the structures compared. Unquantified legal risks are not converted into numbers; they are shown as a separate “legal uncertainty” label. Structures that run out of cash are listed last as not feasible.
      </Callout>
      <Card title="Ranked structures" pad={false}>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="table" data-testid="ranking-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Structure</th>
                <th>Score</th>
                <th className="num">Total tax</th>
                <th className="num">Investor IRR</th>
                <th className="num">Op. closing cash</th>
                <th className="num">To Three X Global</th>
                <th>CCPC</th>
                <th>Legal uncertainty</th>
                <th>Pareto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {evals.map((e, i) => (
                <tr key={e.id} style={!e.feasible ? { opacity: 0.6 } : undefined}>
                  <td>{i + 1}</td>
                  <td>
                    <div className="font-medium">{e.name}</div>
                    {!e.feasible ? <div className="text-[12px]" style={{ color: 'var(--bad)' }}>{e.feasibilityNotes.join(' ')}</div> : null}
                  </td>
                  <td className="w-40">
                    <div className="h-2 rounded-full" style={{ background: 'var(--line)' }}>
                      <div className="h-2 rounded-full" style={{ width: `${Math.round(e.score * 100)}%`, background: 'var(--accent)' }} />
                    </div>
                    <div className="muted mt-0.5 text-[11px]">{(e.score * 100).toFixed(0)} / 100</div>
                  </td>
                  <td className="num">{money(d(e.raw.minTax), cur, { compact: true })}</td>
                  <td className="num">{e.result.investor.irr === null ? 'undef.' : pct(e.result.investor.irr)}</td>
                  <td className="num">{money(d(e.raw.canadianRetained), cur, { compact: true })}</td>
                  <td className="num">{money(d(e.raw.txgReturn), cur, { compact: true })}</td>
                  <td>
                    <Pill tone={e.result.control.status === 'likely-ccpc' ? 'good' : e.result.control.status === 'uncertain' ? 'warn' : 'bad'}>{e.result.control.status.replace('likely-', '')}</Pill>
                  </td>
                  <td>
                    <Pill tone={e.legalUncertainty === 'low' ? 'good' : e.legalUncertainty === 'medium' ? 'warn' : 'bad'}>{e.legalUncertainty}</Pill>
                  </td>
                  <td>{e.pareto ? '✓' : ''}</td>
                  <td>
                    {e.id !== 'G' ? (
                      <Button onClick={() => (addScenario({ ...e.scenario, id: `${base.id}-${e.id}`, name: `${base.name} → ${e.name}` }, false), toast('Saved as a scenario.'))}>Save</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Why “${top.name}” ranks first`} subtitle="Contribution of each weighted priority to its score">
          <ul className="space-y-2">
            {OBJECTIVES.filter((o) => w[o.id] > 0)
              .sort((a, b) => top.contributions[b.id] - top.contributions[a.id])
              .map((o) => (
                <li key={o.id} className="text-[13px]">
                  <div className="flex justify-between">
                    <span>{o.label}</span>
                    <span className="tabular-nums muted">{(top.contributions[o.id] * 100).toFixed(1)} pts</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full" style={{ background: 'var(--line)' }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${top.normalized[o.id] * 100}%`, background: 'var(--chart-5)' }} />
                  </div>
                </li>
              ))}
          </ul>
          {evals[1] && Math.abs(evals[0].score - evals[1].score) < 0.03 ? <Callout tone="warn">The top two structures are within 3 points — treat them as tied until legal questions are resolved.</Callout> : null}
        </Card>
        <Card title="Trade-off (Pareto) view" subtitle="Structures on the frontier are not beaten on both axes by any other" actions={<><select className="input" value={axes[0]} onChange={(e: { target: HTMLSelectElement }) => setAxes([e.target.value as ObjectiveId, axes[1]])} aria-label="X axis">{OBJECTIVES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select><select className="input" value={axes[1]} onChange={(e: { target: HTMLSelectElement }) => setAxes([axes[0], e.target.value as ObjectiveId])} aria-label="Y axis">{OBJECTIVES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></>}>
          <Pareto evals={evals} x={axes[0]} y={axes[1]} />
        </Card>
      </div>
    </>
  );
}

function Pareto({ evals, x, y }: { evals: StructureEval[]; x: ObjectiveId; y: ObjectiveId }) {
  const W = 520;
  const H = 300;
  const p = 36;
  const frontier = evals.filter((e) => !evals.some((f) => f !== e && f.normalized[x] >= e.normalized[x] && f.normalized[y] >= e.normalized[y] && (f.normalized[x] > e.normalized[x] || f.normalized[y] > e.normalized[y])));
  const fr = [...frontier].sort((a, b) => a.normalized[x] - b.normalized[x]);
  const X = (v: number) => p + v * (W - 2 * p);
  const Y = (v: number) => H - p - v * (H - 2 * p);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Pareto chart">
      <line x1={p} y1={H - p} x2={W - p} y2={H - p} stroke="var(--line-2)" />
      <line x1={p} y1={p} x2={p} y2={H - p} stroke="var(--line-2)" />
      <text x={W - p} y={H - 8} textAnchor="end" fontSize="11" fill="var(--ink-3)">
        better → {OBJECTIVES.find((o) => o.id === x)?.label}
      </text>
      <text x={8} y={p - 10} fontSize="11" fill="var(--ink-3)">
        ↑ {OBJECTIVES.find((o) => o.id === y)?.label}
      </text>
      <path d={fr.map((e, i) => `${i ? 'L' : 'M'}${X(e.normalized[x])},${Y(e.normalized[y])}`).join('')} fill="none" stroke="var(--chart-5)" strokeDasharray="4 4" />
      {evals.map((e) => (
        <g key={e.id}>
          <circle cx={X(e.normalized[x])} cy={Y(e.normalized[y])} r={frontier.includes(e) ? 7 : 5} fill={frontier.includes(e) ? 'var(--chart-5)' : 'var(--ink-3)'} opacity={e.feasible ? 1 : 0.4} />
          <text x={X(e.normalized[x]) + 9} y={Y(e.normalized[y]) + 4} fontSize="11" fill="var(--ink-2)">
            {e.id}
          </text>
          <title>{e.name}</title>
        </g>
      ))}
    </svg>
  );
}

function SavedCompare({ cur }: { cur: 'CAD' | 'USD' }) {
  const { scenarios, compareIds, activeId } = useStore((s) => ({ scenarios: s.scenarios, compareIds: s.compareIds, activeId: s.activeId }));
  const list = scenarios.filter((s) => compareIds.includes(s.id));
  const results: [Scenario, ScenarioResult][] = list.map((s) => [s, resultFor(s)]);
  const rows: [string, (s: Scenario, r: ScenarioResult) => string][] = [
    ['Canadian taxes', (_s, r) => money(toDisplay(r.group.canadianCorporateTax, cur, r), cur, { compact: true })],
    ['U.S. taxes', (_s, r) => money(toDisplay(r.group.usTax, cur, r), cur, { compact: true })],
    ['Withholding (final)', (_s, r) => money(toDisplay(r.group.withholdingFinal, cur, r), cur, { compact: true })],
    ['Withholding (temporary)', (_s, r) => money(toDisplay(r.group.withholdingRecoverable, cur, r), cur, { compact: true })],
    ['Foreign tax credits used', (s, r) => money(toDisplay(sum((r.entityYears[s.roles.usVenture] ?? []).map((x) => (x.usTax?.ftc ?? 0) * r.fx[x.year])), cur, r), cur, { compact: true })],
    ['Compliance expenses (illustrative)', (s, r) => money(toDisplay(compliance(s), cur, r), cur, { compact: true })],
    ['Total financing costs (interest, fees, profit share)', (s, r) => money(toDisplay(sum((r.entityYears[s.roles.operator] ?? []).map((x) => x.interestExpense + x.feesPaid + x.royaltiesPaid + x.revSharePaid)), cur, r), cur, { compact: true })],
    ['Operating profitability (EBITDA)', (s, r) => money(toDisplay(sum((r.entityYears[s.roles.operator] ?? []).map((x) => x.ebitda)), cur, r), cur, { compact: true })],
    ['After-tax cash (group)', (_s, r) => money(toDisplay(r.group.afterTaxValue, cur, r), cur, { compact: true })],
    ['Investor IRR', (_s, r) => (r.investor.irr === null ? 'undefined' : pct(r.investor.irr))],
    ['Investor MOIC', (_s, r) => multiple(r.investor.moic)],
    ['Three X Global returns (net from Canada + exit)', (s, r) => money(toDisplay(sum(r.flows.filter((f) => f.to === s.roles.usVenture && s.entities.find((e) => e.id === f.from)?.jurisdiction === 'CA').map((f) => f.net)) + r.txgReturns.exitProceeds, cur, r), cur, { compact: true })],
    ['Operator retained profits', (s, r) => money(toDisplay((r.entityYears[s.roles.operator] ?? []).slice(-1)[0]?.retainedEarnings ?? 0, cur, r), cur, { compact: true })],
    ['Legal feasibility', (_s, r) => (Object.values(r.entityYears).flat().some((x) => x.closingCash < -0.5) ? 'Funding gap' : `${r.issues.filter((i) => i.severity === 'critical').length} critical issues`)],
    ['CCPC concerns', (_s, r) => r.control.status],
    ['Control & governance', (_s, r) => r.control.tests.filter((t) => t.result !== 'pass').map((t) => t.id).join(', ') || 'none flagged'],
    ['NFP implications', (_s, r) => r.nfp.checks.filter((c) => c.status === 'risk').map((c) => c.label.split(' ')[0]).join(', ') || 'no risks flagged'],
  ];
  return (
    <>
      <Card title="Scenarios" subtitle="Choose up to six to compare. Create, duplicate or delete scenarios here.">
        <div className="flex flex-wrap gap-2">
          {scenarios.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px]" style={{ background: compareIds.includes(s.id) ? 'var(--accent-soft)' : 'var(--card-2)' }}>
              <input type="checkbox" checked={compareIds.includes(s.id)} onChange={(e: { target: HTMLInputElement }) => setUi({ compareIds: e.target.checked ? [...compareIds, s.id].slice(-6) : compareIds.filter((x) => x !== s.id) })} />
              {s.name}
              {s.id === activeId ? <Pill tone="accent">active</Pill> : null}
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button icon="plus" onClick={() => duplicateScenario()}>
            Duplicate active
          </Button>
          <Button variant="danger" icon="trash" onClick={() => (scenarios.length > 1 ? deleteScenario(activeId) : toast('At least one scenario is required.'))}>
            Delete active
          </Button>
        </div>
      </Card>
      <Card pad={false}>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="table" data-testid="compare-table">
            <thead>
              <tr>
                <th>Measure ({cur})</th>
                {results.map(([s]) => (
                  <th key={s.id} className="num">
                    <button type="button" onClick={() => setActive(s.id)} className="text-right text-[var(--accent)]">
                      {s.name}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, f]) => (
                <tr key={label}>
                  <td>{label}</td>
                  {results.map(([s, r]) => (
                    <td key={s.id} className="num">
                      {f(s, r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
