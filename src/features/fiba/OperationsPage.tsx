import type { OpsTask } from '../../types/domain';
import { Button, Callout, Card, Grid, Page, Pill } from '../../components/ui';
import { useActive } from '../../hooks/useResult';
import { updateScenario } from '../../state/store';
import { money } from '../../utils/format';
import { sum } from '../../engines/finance/finance';

export function OperationsPage() {
  const { scn, result: r } = useActive();
  const tasks = scn.tasks;
  const set = (id: string, f: (t: OpsTask) => void) => updateScenario((s) => void f(s.tasks.find((t) => t.id === id)!));
  const blockedBy = (t: OpsTask) => (t.dependsOn ?? []).filter((d) => tasks.find((x) => x.id === d)?.status !== 'done');
  const critical = tasks.filter((t) => t.critical);
  const critDone = critical.filter((t) => t.status === 'done').length;
  const signed = sum(scn.sponsors.filter((s) => s.status === 'signed').map((s) => s.confirmed));
  const sponsorNeed = sum(r.events.filter((e) => e.year === scn.years[0]).map((e) => e.sponsorCash));
  const capital = r.totals.capitalInvested;
  const need = r.cumulativeCashNeed;
  const prereqs: { label: string; ok: boolean; detail: string }[] = [
    { label: 'Hosting agreements executed', ok: scn.events.every((e) => e.hostingRights === 'executed'), detail: scn.events.map((e) => `${e.name}: ${e.hostingRights}`).join(' · ') },
    { label: 'Venue confirmed', ok: scn.venues.some((v) => v.availabilityStatus === 'confirmed'), detail: scn.venues.map((v) => `${v.name}: ${v.availabilityStatus}`).join(' · ') },
    { label: 'Insurance arranged', ok: tasks.find((t) => t.area === 'Insurance')?.status === 'done', detail: 'Event liability, cancellation and participant accident cover' },
    { label: 'Permits obtained', ok: tasks.find((t) => t.area === 'Permits')?.status === 'done', detail: 'Municipal event, road and alcohol permits' },
    { label: 'Structure confirmed with counsel', ok: tasks.find((t) => t.area === 'Structure')?.status === 'done', detail: 'LLC classification, cap table, financing documents' },
    { label: `Signed sponsorship covers year-one plan`, ok: signed >= sponsorNeed && sponsorNeed > 0, detail: `${money(signed)} signed vs ${money(sponsorNeed)} modelled for ${scn.years[0]}` },
    { label: 'Capital covers cumulative cash need', ok: capital >= need, detail: `${money(capital)} capital vs ${money(need)} need` },
  ];
  const ready = prereqs.filter((p) => p.ok).length;
  return (
    <Page title="Project Operations" subtitle="Plan and track the Toronto FIBA 3x3 project. Prerequisites that could make an event commercially or contractually unviable are flagged on the launch readiness dashboard.">
      <Card title="Launch readiness" subtitle={`${ready} of ${prereqs.length} prerequisites met · critical tasks ${critDone}/${critical.length}`}>
        <div className="mb-3 h-2 rounded-full" style={{ background: 'var(--line)' }}>
          <div className="h-2 rounded-full" style={{ width: `${(ready / prereqs.length) * 100}%`, background: ready === prereqs.length ? 'var(--good)' : 'var(--warn)' }} />
        </div>
        <Grid cols={2}>
          {prereqs.map((p) => (
            <div key={p.label} className="flex items-start gap-3 rounded-xl p-3" style={{ background: p.ok ? 'var(--good-soft)' : 'var(--warn-soft)' }}>
              <span style={{ color: p.ok ? 'var(--good)' : 'var(--warn)' }}>{p.ok ? '✓' : '!'}</span>
              <div>
                <div className="text-[14px] font-medium">{p.label}</div>
                <div className="muted text-[12px]">{p.detail}</div>
              </div>
            </div>
          ))}
        </Grid>
        {ready < prereqs.length ? <Callout tone="warn">Go / no-go: not ready. Missing prerequisites above could make an event commercially or contractually unviable.</Callout> : <Callout tone="good">All tracked prerequisites are met.</Callout>}
      </Card>
      <Card title="Tasks" subtitle="Owner, deadline, status, budget, contract reference, dependencies, financial impact and entity" actions={<Button icon="plus" onClick={() => updateScenario((s) => void s.tasks.push({ id: `t${Date.now().toString(36)}`, area: 'General', title: 'New task', owner: '', status: 'not-started', critical: false }))}>Add task</Button>} pad={false}>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="table" data-testid="tasks-table">
            <thead>
              <tr>
                <th>Area</th>
                <th>Task</th>
                <th>Owner</th>
                <th>Deadline</th>
                <th>Status</th>
                <th className="num">Budget</th>
                <th>Contract ref</th>
                <th>Depends on</th>
                <th>Financial impact</th>
                <th>Entity</th>
                <th>Critical</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const b = blockedBy(t);
                return (
                  <tr key={t.id}>
                    <td>
                      <input className="input w-36" value={t.area} onChange={(e: { target: HTMLInputElement }) => set(t.id, (x) => void (x.area = e.target.value))} aria-label="Area" />
                    </td>
                    <td className="min-w-[240px]">
                      <input className="input" value={t.title} onChange={(e: { target: HTMLInputElement }) => set(t.id, (x) => void (x.title = e.target.value))} aria-label="Task" />
                      {b.length && t.status !== 'done' ? <div className="mt-0.5 text-[11px]" style={{ color: 'var(--warn)' }}>Waiting on: {b.map((x) => tasks.find((y) => y.id === x)?.title).join('; ')}</div> : null}
                    </td>
                    <td>
                      <input className="input w-28" value={t.owner} onChange={(e: { target: HTMLInputElement }) => set(t.id, (x) => void (x.owner = e.target.value))} aria-label="Owner" />
                    </td>
                    <td>
                      <input type="date" className="input" value={t.deadline ?? ''} onChange={(e: { target: HTMLInputElement }) => set(t.id, (x) => void (x.deadline = e.target.value))} aria-label="Deadline" />
                    </td>
                    <td>
                      <select className="input" value={t.status} onChange={(e: { target: HTMLSelectElement }) => set(t.id, (x) => void (x.status = e.target.value as OpsTask['status']))} aria-label="Status" data-testid={`task-status-${t.id}`}>
                        <option value="not-started">Not started</option>
                        <option value="in-progress">In progress</option>
                        <option value="blocked">Blocked</option>
                        <option value="done">Done</option>
                      </select>
                    </td>
                    <td className="num">
                      <input className="input num w-24" inputMode="decimal" value={t.budget ?? ''} onChange={(e: { target: HTMLInputElement }) => set(t.id, (x) => void (x.budget = Number(e.target.value) || undefined))} aria-label="Budget" />
                    </td>
                    <td>
                      <input className="input w-32" value={t.contractRef ?? ''} onChange={(e: { target: HTMLInputElement }) => set(t.id, (x) => void (x.contractRef = e.target.value))} aria-label="Contract reference" />
                    </td>
                    <td>
                      <select className="input w-40" multiple value={t.dependsOn ?? []} onChange={(e: { target: HTMLSelectElement }) => set(t.id, (x) => void (x.dependsOn = Array.from(e.target.selectedOptions).map((o) => o.value)))} aria-label="Dependencies">
                        {tasks
                          .filter((x) => x.id !== t.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.title}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <input className="input w-36" value={t.financialImpact ?? ''} onChange={(e: { target: HTMLInputElement }) => set(t.id, (x) => void (x.financialImpact = e.target.value))} aria-label="Financial impact" />
                    </td>
                    <td>
                      <select className="input" value={t.entityId ?? ''} onChange={(e: { target: HTMLSelectElement }) => set(t.id, (x) => void (x.entityId = e.target.value))} aria-label="Entity">
                        <option value="">—</option>
                        {scn.entities.filter((e) => e.inGroup).map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input type="checkbox" checked={t.critical} onChange={(e: { target: HTMLInputElement }) => set(t.id, (x) => void (x.critical = e.target.checked))} aria-label="Critical" />
                      {t.critical ? <Pill tone="warn">critical</Pill> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}
