import { useState } from 'react';
import { FIBA_REQUIREMENTS, FIBA_STATUS_LABEL, type FibaFormat, type FibaStatus } from '../../data/fiba';
import type { Venue } from '../../types/domain';
import { Button, Callout, Card, Page, Pill, Segmented, SourceLinks } from '../../components/ui';
import { useActive } from '../../hooks/useResult';
import { updateScenario } from '../../state/store';

const TONE: Record<FibaStatus, 'good' | 'accent' | 'neutral' | 'warn' | 'bad'> = { 'confirmed-contract': 'good', 'official-rule': 'accent', historical: 'neutral', assumption: 'warn', pending: 'warn', 'not-applicable': 'neutral' };

export function FibaPage() {
  const { scn } = useActive();
  const formats = Array.from(new Set(scn.events.map((e) => (e.format === 'Combined-WT-WS' ? ['WT', 'WS'] : [e.format])).flat())) as FibaFormat[];
  const [cols, setCols] = useState<FibaFormat[]>(formats.length ? formats : ['WT', 'WS']);
  const [cat, setCat] = useState('all');
  const state = (id: string) => scn.fiba.find((f) => f.id === id);
  const setReq = (id: string, patch: Partial<{ status: string; note: string; contractRef: string; done: boolean }>) =>
    updateScenario((s) => {
      const cur = s.fiba.find((f) => f.id === id);
      if (cur) Object.assign(cur, patch);
      else s.fiba.push({ id, ...patch });
    });
  const cats = Array.from(new Set(FIBA_REQUIREMENTS.map((r) => r.category)));
  const reqs = FIBA_REQUIREMENTS.filter((r) => cat === 'all' || r.category === cat);
  const done = scn.fiba.filter((f) => f.done).length;
  return (
    <Page title="FIBA Operations" subtitle="Requirements by competition format, classified by evidence. Book 6 of FIBA’s Internal Regulations (in force 22 April 2026) is the binding rule source in the library; historical organiser guides and promotional materials are not substitutes for current hosting agreements.">
      <Callout tone="warn" title="Men’s and women’s events are not interchangeable">
        The World Tour, Challengers and the Women’s Series are governed by separate handbooks, have different team counts and allocation rules, and may require separate hosting agreements. Do not assume the rights or costs of men’s and women’s events are identical.
      </Callout>
      <Card
        title="Requirements register and agreement checklist"
        subtitle={`${done} of ${FIBA_REQUIREMENTS.length} items checked off`}
        actions={
          <>
            <Segmented label="Formats" value={cols.join(',')} onChange={(v) => setCols(v.split(',') as FibaFormat[])} options={[{ value: 'WT,WS', label: 'WT + WS' }, { value: 'WT,WS,Challenger', label: '+ Challenger' }, { value: 'Endorsed,Grassroots', label: 'Endorsed / grassroots' }, { value: 'WT,WS,Challenger,Endorsed,Grassroots', label: 'All' }]} />
            <select className="input" value={cat} onChange={(e: { target: HTMLSelectElement }) => setCat(e.target.value)} aria-label="Category">
              <option value="all">All categories</option>
              {cats.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </>
        }
        pad={false}
      >
        <div className="overflow-x-auto px-2 pb-2">
          <table className="table" data-testid="fiba-table">
            <thead>
              <tr>
                <th>Done</th>
                <th>Requirement</th>
                {cols.map((c) => (
                  <th key={c}>{c === 'WT' ? 'World Tour (men)' : c === 'WS' ? 'Women’s Series' : c}</th>
                ))}
                <th>Contract ref / note</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => {
                const st = state(r.id);
                return (
                  <tr key={r.id}>
                    <td>
                      <input type="checkbox" checked={!!st?.done} onChange={(e: { target: HTMLInputElement }) => setReq(r.id, { done: e.target.checked })} aria-label={`Mark ${r.title} done`} />
                    </td>
                    <td className="min-w-[280px]">
                      <div className="text-[11px] uppercase tracking-wide muted">{r.category}</div>
                      <div className="font-medium">{r.title}</div>
                      <div className="muted mt-0.5 text-[12px] leading-snug">{r.detail}</div>
                      {r.citation ? <div className="mt-1"><SourceLinks refs={[{ id: r.sourceId ?? 'fiba-b6', label: r.citation }]} /></div> : null}
                      {r.revenueImpact ? <div className="mt-1 text-[12px]" style={{ color: 'var(--warn)' }}>Revenue impact: {r.revenueImpact}</div> : null}
                    </td>
                    {cols.map((c) => {
                      const s = (st?.status as FibaStatus | undefined) && st?.status !== '' ? (st!.status as FibaStatus) : r.byFormat[c];
                      return <td key={c}>{s ? <Pill tone={TONE[s]}>{FIBA_STATUS_LABEL[s]}</Pill> : <span className="muted">—</span>}</td>;
                    })}
                    <td className="min-w-[200px]">
                      <input className="input text-[13px]" placeholder="e.g., Hosting Agreement §4.2" value={st?.contractRef ?? ''} onChange={(e: { target: HTMLInputElement }) => setReq(r.id, { contractRef: e.target.value })} aria-label="Contract reference" />
                      <select className="input mt-1 text-[13px]" value={st?.status ?? ''} onChange={(e: { target: HTMLSelectElement }) => setReq(r.id, { status: e.target.value })} aria-label="Override classification">
                        <option value="">Classification: default</option>
                        {Object.entries(FIBA_STATUS_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <VenueAnalysis venues={scn.venues} />
    </Page>
  );
}

const VENUE_FIELDS: { key: keyof Venue; label: string; type: 'text' | 'number' }[] = [
  { key: 'rentalCost', label: 'Rental cost (CAD)', type: 'number' },
  { key: 'capacity', label: 'Capacity', type: 'number' },
  { key: 'permittedCommercial', label: 'Permitted commercial activities', type: 'text' },
  { key: 'sponsorshipRestrictions', label: 'Sponsorship restrictions', type: 'text' },
  { key: 'transitScore', label: 'Transit access', type: 'text' },
  { key: 'accessibility', label: 'Accessibility', type: 'text' },
  { key: 'hospitalityPotential', label: 'Hospitality potential', type: 'text' },
  { key: 'productionCostEstimate', label: 'Production cost estimate (CAD)', type: 'number' },
  { key: 'permitsRequired', label: 'Required permits', type: 'text' },
  { key: 'insuranceRequirements', label: 'Insurance requirements', type: 'text' },
];

function VenueAnalysis({ venues }: { venues: Venue[] }) {
  const set = (id: string, f: (v: Venue) => void) => updateScenario((s) => void f(s.venues.find((v) => v.id === id)!));
  return (
    <Card title="Toronto venue analysis" subtitle="Enter only what venues have confirmed. Availability is never assumed." actions={<Button icon="plus" onClick={() => updateScenario((s) => void s.venues.push({ id: `v${Date.now().toString(36)}`, name: 'New venue option', availabilityStatus: 'unknown' }))}>Add venue</Button>} pad={false}>
      <div className="overflow-x-auto px-2 pb-2">
        <table className="table">
          <thead>
            <tr>
              <th>Venue</th>
              <th>Availability</th>
              <th>Indoor</th>
              <th>Ticketing feasible</th>
              <th>Broadcast infra</th>
              {VENUE_FIELDS.map((f) => (
                <th key={f.key}>{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {venues.map((v) => (
              <tr key={v.id}>
                <td>
                  <input className="input min-w-[200px]" value={v.name} onChange={(e: { target: HTMLInputElement }) => set(v.id, (x) => void (x.name = e.target.value))} aria-label="Venue name" />
                </td>
                <td>
                  <select className="input" value={v.availabilityStatus} onChange={(e: { target: HTMLSelectElement }) => set(v.id, (x) => void (x.availabilityStatus = e.target.value as Venue['availabilityStatus']))} aria-label="Availability">
                    {['unknown', 'inquiry', 'hold', 'confirmed', 'unavailable'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="checkbox" checked={!!v.indoor} onChange={(e: { target: HTMLInputElement }) => set(v.id, (x) => void (x.indoor = e.target.checked))} aria-label="Indoor" />
                  <div className="muted text-[11px]">{v.indoor ? 'weather-protected' : 'weather exposure'}</div>
                </td>
                {(['ticketingFeasible', 'broadcastInfrastructure'] as const).map((k) => (
                  <td key={k}>
                    <select className="input" value={v[k] ?? 'unknown'} onChange={(e: { target: HTMLSelectElement }) => set(v.id, (x) => void (x[k] = e.target.value as Venue[typeof k]))} aria-label={k}>
                      <option>unknown</option>
                      <option>yes</option>
                      <option>no</option>
                    </select>
                  </td>
                ))}
                {VENUE_FIELDS.map((f) => (
                  <td key={f.key}>
                    <input className="input min-w-[140px]" inputMode={f.type === 'number' ? 'decimal' : undefined} value={(v[f.key] as string | number | undefined) ?? ''} onChange={(e: { target: HTMLInputElement }) => set(v.id, (x) => void ((x as unknown as Record<string, unknown>)[f.key] = f.type === 'number' ? Number(e.target.value) || undefined : e.target.value))} aria-label={f.label} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
