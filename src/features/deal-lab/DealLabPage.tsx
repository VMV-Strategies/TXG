import { useMemo, useState } from 'react';
import { applyPreset, PRESETS, type PresetId } from '../../engines/optimization/optimize';
import { computeScenario } from '../../engines/scenarios/compute';
import { analyzeControl } from '../../engines/corporate/control';
import { Button, Callout, Card, Grid, IssueList, Page, Pill, SourceLinks, Term } from '../../components/ui';
import { KV } from '../../components/charts';
import { useActive } from '../../hooks/useResult';
import { addScenario, toast, updateScenario, useStore } from '../../state/store';
import { money, pct, toDisplay, multiple } from '../../utils/format';
import { sum } from '../../engines/finance/finance';
import type { Scenario } from '../../types/domain';

const DEAL_LIST: { id: PresetId; n: number; admin: string[]; docs: string[] }[] = [
  { id: 'B', n: 1, admin: ['Share subscription agreement', 'Directors’ resolution; share register update', 'ISC register update (CBCA s. 21.1)', 'Form 5471 for U.S. 10% owners'], docs: ['ita-125-7-ccpc', 'cbca-21.1', 'irc-6046'] },
  { id: 'A', n: 2, admin: ['Loan agreement and promissory note', 'Arm’s-length interest benchmark', 'Annual NR4 slips if interest is subject to withholding'], docs: ['ita-18-4', 'ita-247-2', 'tr-xi-5p'] },
  { id: 'C', n: 3, admin: ['Subscription + loan agreements', 'Thin-cap equity tracking', 'Transfer-pricing file'], docs: ['ita-18-4', 'ita-214-16', 'ita-125-7-ccpc'] },
  { id: 'H', n: 4, admin: ['Convertible note with conversion mechanics', 'Control analysis (rights deemed exercised)'], docs: ['ita-251-5', 'ita-125-7-ccpc'] },
  { id: 'I', n: 5, admin: ['Articles of amendment creating the preferred class', 'Dividend solvency tests'], docs: ['tr-x-2a-5p', 'ita-212-2'] },
  { id: 'D', n: 6, admin: ['Joint-venture agreement', 'Legal opinion on partnership / PE status', 'Possible Canadian tax filings by the U.S. party'], docs: ['tr-vii', 'tr-v', 'ita-212-1'] },
  { id: 'F', n: 7, admin: ['Management services agreement', 'Transfer-pricing documentation', 'Reg. 105 waivers for services in Canada'], docs: ['ita-212-4', 'itr-105', 'ita-247-2'] },
  { id: 'J', n: 8, admin: ['Licence agreement and IP ownership chain', 'Royalty benchmarking', 'NR4 / Part XIII remittances'], docs: ['tr-xii', 'ita-212-1'] },
  { id: 'K', n: 9, admin: ['Revenue-sharing agreement', 'Characterisation opinion', 'Revenue audit rights'], docs: ['ita-212-1', 'tr-xi-5p'] },
  { id: 'E', n: 10, admin: ['Incorporate the event subsidiary', 'Shareholders’ agreement', 'Business-limit allocation (associated corporations)'], docs: ['ita-256-1', 'ita-125-2'] },
  { id: 'L', n: 11, admin: ['All of the subsidiary steps', 'Management services agreement', 'Group transfer-pricing policy'], docs: ['ita-256-1', 'ita-247-2'] },
  { id: 'G', n: 12, admin: ['Depends on the relationships you build on the Entity Map'], docs: [] },
];

export function DealLabPage() {
  const { scn, result } = useActive();
  const [pick, setPick] = useState<PresetId>('C');
  const cur = useStore((s) => s.currency);
  const variant: Scenario = useMemo(() => (pick === 'G' ? scn : applyPreset(scn, pick)), [scn, pick]);
  const r = useMemo(() => (pick === 'G' ? result : computeScenario(variant)), [variant, pick, result]);
  const before = useMemo(() => analyzeControl(scn), [scn]);
  const op = variant.roles.operator;
  const txg = variant.roles.usVenture;
  const opRows = r.entityYears[op] ?? [];
  const d = (n: number, y?: number) => toDisplay(n, cur, r, y);
  const capitalIn = sum(r.flows.filter((f) => f.capital && f.to === op && f.from === txg).map((f) => f.gross));
  const servicing = sum(r.flows.filter((f) => f.from === op && f.to === txg && !f.capital).map((f) => f.gross));
  const repaid = sum(r.flows.filter((f) => f.from === op && f.to === txg && f.capital).map((f) => f.gross));
  const costOfCapital = capitalIn ? servicing / capitalIn / r.years.length : null;
  const deal = DEAL_LIST.find((x) => x.id === pick)!;
  const preset = PRESETS.find((p) => p.id === pick)!;
  const apply = () => {
    if (pick === 'G') return;
    updateScenario((s) => {
      const v = applyPreset(s, pick);
      return { ...v, id: s.id, name: s.name };
    });
    toast(`Applied “${preset.name}” to ${scn.name}. Undo is available.`);
  };
  const saveAs = () => {
    addScenario({ ...variant, id: `${scn.id}-${pick}`, name: `${scn.name} → ${preset.name}`, baseline: scn.baseline });
    toast('Saved as a new scenario.');
  };
  return (
    <Page title="Deal Lab" subtitle="Twelve ways to finance the Canadian operation. Each is computed on your current scenario — same events, same assumptions — so the differences come only from the structure.">
      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[300px_1fr]">
        <Card title="Structures" pad={false}>
          <ul className="max-h-[70dvh] divide-y overflow-y-auto" style={{ borderColor: 'var(--line)' }}>
            {DEAL_LIST.map((x) => {
              const p = PRESETS.find((y) => y.id === x.id)!;
              return (
                <li key={x.id}>
                  <button type="button" onClick={() => setPick(x.id)} className="w-full px-4 py-3 text-left" style={pick === x.id ? { background: 'var(--accent-soft)' } : undefined} data-testid={`deal-${x.id}`}>
                    <div className="text-[14px] font-medium">
                      {x.n}. {x.id === 'G' ? 'Customized user-defined structure' : p.name}
                    </div>
                    <div className="muted text-[12px] leading-snug">{p.summary}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
        <div className="space-y-5">
          <Card
            title={pick === 'G' ? 'Customized user-defined structure' : preset.name}
            subtitle={preset.summary}
            actions={
              pick !== 'G' ? (
                <>
                  <Button variant="primary" onClick={apply} data-testid="apply-structure">
                    Apply to this scenario
                  </Button>
                  <Button onClick={saveAs}>Save as new scenario</Button>
                </>
              ) : (
                <a className="btn btn-secondary" href="#/entities">
                  Edit on Entity Map
                </a>
              )
            }
          >
            <Grid cols={4}>
              <Metric label="Initial cash into Canada" value={money(d(capitalIn), cur, { compact: true })} />
              <Metric label="Interest, fees & dividends to Three X Global" value={money(d(servicing), cur, { compact: true })} />
              <Metric label="Capital repaid" value={money(d(repaid), cur, { compact: true })} />
              <Metric label="Annual cost of capital to operator" value={costOfCapital === null ? 'n/a' : pct(costOfCapital)} hint="Servicing ÷ capital ÷ years" />
              <Metric label="Three X Global IRR" value={r.txgReturns.irr === null ? 'undefined' : pct(r.txgReturns.irr)} />
              <Metric label="Investor IRR / MOIC" value={`${r.investor.irr === null ? '—' : pct(r.investor.irr)} / ${multiple(r.investor.moic)}`} />
              <Metric label="Total tax (both countries)" value={money(d(r.group.totalTax), cur, { compact: true })} />
              <Metric label="Operator closing cash" value={money(d(opRows[opRows.length - 1]?.closingCash ?? 0), cur, { compact: true })} tone={(opRows[opRows.length - 1]?.closingCash ?? 0) < 0 ? 'bad' : undefined} />
            </Grid>
          </Card>
          <Grid cols={2}>
            <Card title="Ownership changes" subtitle="Cap table of the operator, rights to acquire shares counted as exercised for control">
              <div className="overflow-x-auto">
                <CapTable scn={variant} />
              </div>
              <div className="mt-3 flex items-center gap-2 text-[13px]">
                <span className="muted">CCPC before → after:</span>
                <Pill tone={before.status === 'likely-ccpc' ? 'good' : before.status === 'uncertain' ? 'warn' : 'bad'}>{before.status}</Pill>→<Pill tone={r.control.status === 'likely-ccpc' ? 'good' : r.control.status === 'uncertain' ? 'warn' : 'bad'}>{r.control.status}</Pill>
              </div>
            </Card>
            <Card title="Financing obligations" subtitle="What the operator owes Three X Global each year">
              <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th className="num">Interest</th>
                    <th className="num">Fees / royalties / share</th>
                    <th className="num">Dividends</th>
                    <th className="num">Principal</th>
                    <th className="num">Withheld</th>
                  </tr>
                </thead>
                <tbody>
                  {r.years.map((y) => {
                    const fs = r.flows.filter((f) => f.year === y && f.from === op && f.to === txg);
                    const k = (kinds: string[]) => sum(fs.filter((f) => kinds.includes(f.kind)).map((f) => f.gross));
                    return (
                      <tr key={y}>
                        <td>{y}</td>
                        <td className="num">{money(d(k(['interest']), y), cur, { compact: true })}</td>
                        <td className="num">{money(d(k(['management-fee', 'royalty', 'revenue-share', 'guarantee-fee']), y), cur, { compact: true })}</td>
                        <td className="num">{money(d(k(['dividend']), y), cur, { compact: true })}</td>
                        <td className="num">{money(d(k(['principal']), y), cur, { compact: true })}</td>
                        <td className="num">{money(d(sum(fs.map((f) => f.withholding)), y), cur, { compact: true })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </Card>
          </Grid>
          <Grid cols={2}>
            <Card title="Entity-level and combined outcomes">
              <KV
                items={[
                  ['Operator net income (period)', money(d(sum(opRows.map((x) => x.netIncome))), cur)],
                  ['Operator Canadian tax', money(d(sum(opRows.map((x) => x.incomeTax))), cur)],
                  ['Three X Global after-tax receipts', money(d(sum((r.entityYears[txg] ?? []).map((x) => x.netIncome))), cur)],
                  ['Canadian withholding (final)', money(d(r.group.withholdingFinal), cur)],
                  ['Reg. 105 (recoverable)', money(d(r.group.withholdingRecoverable), cur)],
                  ['U.S. tax', money(d(r.group.usTax), cur)],
                  ['Group after-tax value', money(d(r.group.afterTaxValue), cur)],
                ]}
              />
            </Card>
            <Card title="Administrative burden" subtitle="Documents and filings this structure needs">
              <ul className="list-disc space-y-1 pl-5 text-[14px]">
                {deal.admin.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <div className="mt-3">
                <SourceLinks refs={deal.docs.map((id) => ({ id, label: id.replace(/^ita-/, 'ITA ').replace(/^tr-/, 'Treaty ').replace(/^irc-/, 'IRC ').replace(/^cbca-/, 'CBCA ').replace(/^itr-/, 'ITR ') }))} />
              </div>
            </Card>
          </Grid>
          <Card title="Tax issues and risks for this structure">
            <IssueList issues={r.issues.filter((i) => i.area !== 'data')} />
          </Card>
        </div>
      </div>
      <ControlAnalysisCard />
    </Page>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'bad' }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-0.5 text-[20px] font-semibold tabular-nums" style={{ color: tone === 'bad' ? 'var(--bad)' : undefined }}>
        {value}
      </div>
      {hint ? <div className="muted text-[11px]">{hint}</div> : null}
    </div>
  );
}

function CapTable({ scn }: { scn: Scenario }) {
  const ctrl = analyzeControl(scn);
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Holder</th>
          <th>Residence</th>
          <th className="num">Shares</th>
          <th className="num">Votes</th>
          <th className="num">Votes (diluted)</th>
        </tr>
      </thead>
      <tbody>
        {ctrl.holders.map((h) => (
          <tr key={h.holderId}>
            <td>{h.name}</td>
            <td>{h.residency === 'canadian' ? 'Canada' : h.residency === 'non-resident' ? 'Non-resident' : 'Unknown'}</td>
            <td className="num">{h.shares.toLocaleString()}</td>
            <td className="num">{pct(h.pctVotes)}</td>
            <td className="num">{pct(h.pctVotesDeemed)}</td>
          </tr>
        ))}
        {!ctrl.holders.length ? (
          <tr>
            <td colSpan={5} className="muted">
              No shareholders recorded.
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function ControlAnalysisCard() {
  const { scn, result } = useActive();
  const mode = useStore((s) => s.mode);
  const c = result.control;
  const [nrPct, setNrPct] = useState(0.3);
  // Simulate issuing new voting shares to a non-resident so it holds nrPct of votes (post-issue)
  const sim = useMemo(() => {
    const s: Scenario = structuredClone(scn);
    const opId = s.roles.operator;
    const existingVotes = sum(s.relationships.filter((r) => r.to === opId && (r.type === 'common-shares' || r.type === 'preferred-shares')).map((r) => (r.equity?.shares ?? 0) * (r.equity?.votesPerShare ?? 0)));
    const add = nrPct >= 1 ? 0 : (existingVotes * nrPct) / (1 - nrPct);
    s.entities.push({ id: 'sim-nr', name: 'Hypothetical non-resident investor', kind: 'investor', jurisdiction: 'US', x: 0, y: 0, inGroup: false, currency: 'USD', evidence: 'assumption', tax: { residence: 'US' } });
    s.relationships.push({ id: 'sim-rel', type: 'common-shares', from: 'sim-nr', to: opId, currency: 'CAD', amount: 0, startYear: s.years[0], equity: { shares: add, votesPerShare: 1, classLabel: 'Simulated' }, evidence: 'assumption' });
    return analyzeControl(s);
  }, [scn, nrPct]);
  return (
    <Card title={<>Canadian control analysis — <Term t="CCPC" /></>} subtitle="Never assumes that 51% Canadian ownership alone guarantees CCPC status. Unknown facts make the result uncertain rather than favourable." id="ccpc">
      <Callout tone={c.status === 'likely-ccpc' ? 'good' : c.status === 'uncertain' ? 'warn' : 'bad'} title={c.status === 'likely-ccpc' ? 'Appears to qualify on the facts entered' : c.status === 'uncertain' ? 'Uncertain' : 'Appears not to qualify'}>
        {c.statusPlain}
      </Callout>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="h3 mb-2">Control tests</h3>
          <ul className="space-y-3">
            {c.tests.map((t) => (
              <li key={t.id} className="text-[14px]">
                <div className="flex items-center gap-2 font-medium">
                  <Pill tone={t.result === 'pass' ? 'good' : t.result === 'fail' ? 'bad' : 'warn'}>{t.result}</Pill>
                  {t.label}
                </div>
                <p className="mt-1 leading-relaxed ink2">{t.plain}</p>
                {mode !== 'simple' ? <p className="muted mt-1 text-[13px]">{t.expert}</p> : null}
                <div className="mt-1">
                  <SourceLinks refs={t.sources} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="h3 mb-2">What could cause {scn.entities.find((e) => e.id === scn.roles.operator)?.name ?? 'the operator'} to lose CCPC status?</h3>
            <ul className="list-disc space-y-1 pl-5 text-[14px] leading-relaxed">
              {c.lossRisks.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl p-4" style={{ background: 'var(--card-2)' }}>
            <h3 className="h3">How much ownership can be transferred?</h3>
            <p className="muted mt-1 text-[13px]">{c.headroomPlain}</p>
            <label className="mt-3 block text-[13px]">
              Simulate a new non-resident holding <b>{pct(nrPct, 0)}</b> of the votes
              <input type="range" min={0} max={0.7} step={0.01} value={nrPct} onChange={(e: { target: HTMLInputElement }) => setNrPct(Number(e.target.value))} className="mt-2 w-full" aria-label="Simulated non-resident voting share" />
            </label>
            <div className="mt-2 flex items-center gap-2 text-[13px]">
              Result: <Pill tone={sim.status === 'likely-ccpc' ? 'good' : sim.status === 'uncertain' ? 'warn' : 'bad'}>{sim.status}</Pill>
              <span className="muted">combined non-resident votes {pct(sim.nonResidentVotesDeemed)}</span>
            </div>
          </div>
          <div>
            <h3 className="h3 mb-2">Evidence still needed</h3>
            <ul className="list-disc space-y-1 pl-5 text-[14px]">
              {c.missingEvidence.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Holder</th>
              <th>Residence</th>
              <th className="num">Votes</th>
              <th className="num">Votes incl. rights</th>
              <th className="num">Board seats</th>
              <th>Veto / USA</th>
              <th>Lender</th>
              <th>≥25% (thin cap)</th>
            </tr>
          </thead>
          <tbody>
            {c.holders.map((h) => (
              <tr key={h.holderId}>
                <td>{h.name}</td>
                <td>{h.residency}</td>
                <td className="num">{pct(h.pctVotes)}</td>
                <td className="num">{pct(h.pctVotesDeemed)}</td>
                <td className="num">{h.boardSeats}</td>
                <td>{[...h.vetoRights, h.usa ? 'USA' : ''].filter(Boolean).join(', ') || '—'}</td>
                <td>{h.lender ? 'Yes' : 'No'}</td>
                <td>{h.specifiedShareholder ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
