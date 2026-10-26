import { useEffect, useState } from 'react';
import { readXlsx } from '../../engines/workbook/xlsx';
import { inventory, reconcile, reviewModel, workbookBaseline, Workbook, type Inventory, type ModelReview, type Reconciliation, type MapEntry } from '../../engines/workbook/workbook';
import { Button, Callout, Pill, Segmented } from '../../components/ui';
import { getBlob } from './library';
import { addScenario, getState, toast } from '../../state/store';
import { activeScenario } from '../../state/store';
import { writeXlsx } from '../../engines/workbook/xlsx';
import { downloadBlob } from '../reports/exporters';

export function WorkbookPanel({ docId }: { docId: string }) {
  const [wb, setWb] = useState<Workbook | null>(null);
  const [inv, setInv] = useState<Inventory | null>(null);
  const [rec, setRec] = useState<Reconciliation | null>(null);
  const [review, setReview] = useState<ModelReview[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [scenario, setScenario] = useState<'Conservative' | 'Base' | 'Exceeds'>('Base');
  const [menShare, setMenShare] = useState(0.6);
  const [mapping, setMapping] = useState<MapEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const blob = await getBlob(docId);
      if (!blob) throw new Error('Original file not found in local storage.');
      const raw = await readXlsx(await blob.arrayBuffer());
      const w = Workbook.fromRaw(raw);
      setWb(w);
      setInv(inventory(w));
      setRec(reconcile(w));
      setReview(reviewModel(w));
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  useEffect(() => {
    setWb(null);
    setInv(null);
    setRec(null);
  }, [docId]);
  const isThreeX = !!inv && inv.sheets.some((s) => s.name === 'Scenario_Control') && inv.sheets.some((s) => s.name === 'NA_Event_Model');
  const create = () => {
    if (!wb) return;
    const base = activeScenario(getState());
    const { scenario: s, mapping: m, warnings } = workbookBaseline(wb, base, scenario, menShare);
    setMapping(m);
    addScenario(s, true);
    toast(`Created “${s.name}”. ${warnings.length ? warnings.join('; ') : 'All mapped cells found.'}`);
  };
  const exportReport = async () => {
    if (!rec || !inv) return;
    const blob = await writeXlsx([
      { name: 'Summary', rows: [['Formula cells compared', rec.compared], ['Matched', rec.matched], ['Mismatched', rec.mismatched.length], ['Errors', rec.errors.length], ['Circular', rec.circular.length], ['Total formulas', inv.totalFormulas], ['Total numeric hard-codes', inv.totalHardcodes]] },
      { name: 'Sheets', rows: [['Sheet', 'Formulas', 'Hard-codes', 'Text cells', 'Depends on', 'Used by'], ...inv.sheets.map((s) => [s.name, s.formulas, s.hardcodes, s.textCells, s.dependsOn.join(', '), s.usedBy.join(', ')])] },
      { name: 'Mismatches', rows: [['Cell', 'Formula', 'Workbook', 'App', 'Difference'], ...rec.mismatched.map((m) => [m.cell, m.formula, String(m.workbook), String(m.app), m.diff ?? ''])] },
      { name: 'Assumptions', rows: [['Cell', 'Label', 'Conservative', 'Base', 'Exceeds'], ...inv.assumptions.map((a) => [a.cell, a.label, ...a.values.map((v) => (typeof v === 'number' ? v : String(v ?? '')))])] },
      { name: 'Model review', rows: [['Severity', 'Finding', 'Detail', 'Cells'], ...review.map((r) => [r.severity, r.title, r.detail, r.cells.join(', ')])] },
      { name: 'Cell mapping', rows: [['App field', 'Sheet', 'Label', 'Cell', 'Value', 'Note'], ...mapping.map((m) => [m.appField, m.sheet, m.label, m.cell ?? '', m.value ?? '', m.note ?? ''])] },
    ]);
    downloadBlob(blob, 'workbook-reconciliation.xlsx');
  };
  return (
    <div className="mb-5 rounded-2xl p-4" style={{ background: 'var(--card-2)' }} data-testid="workbook-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="h3">Financial model import and reconciliation</div>
          <p className="muted text-[13px]">Recalculates every formula with the app’s engine and compares the results with the values saved in the workbook. Nothing is silently substituted.</p>
        </div>
        <Button variant="primary" onClick={run} disabled={busy} data-testid="wb-run">
          {busy ? 'Analysing…' : wb ? 'Re-run' : 'Analyse workbook'}
        </Button>
      </div>
      {err ? <Callout tone="bad">{err}</Callout> : null}
      {rec && inv ? (
        <div className="mt-4 space-y-4">
          <Callout tone={rec.ok ? 'good' : 'warn'} title={rec.ok ? 'Reconciliation passed' : 'Reconciliation found differences'}>
            {rec.matched.toLocaleString()} of {rec.compared.toLocaleString()} formula cells reproduce the workbook’s saved values exactly (tolerance 1e-6). {rec.mismatched.length} differences, {rec.errors.length} error values, {rec.circular.length} circular references. {inv.unsupportedFunctions.length ? `Unsupported functions: ${inv.unsupportedFunctions.join(', ')}.` : 'All functions used are supported.'}
          </Callout>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="label mb-1">Worksheets ({inv.sheets.length})</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Sheet</th>
                    <th className="num">Formulas</th>
                    <th className="num">Hard-codes</th>
                    <th>Depends on</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.sheets.map((s) => (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td className="num">{s.formulas}</td>
                      <td className="num">{s.hardcodes}</td>
                      <td className="text-[11px] muted">{s.dependsOn.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3">
              <div>
                <div className="label mb-1">Functions used</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(inv.functions).map(([f, n]) => (
                    <Pill key={f}>
                      {f} × {n}
                    </Pill>
                  ))}
                </div>
              </div>
              <div>
                <div className="label mb-1">Scenarios</div>
                <p className="text-[13px]">{inv.scenarios.length ? `${inv.scenarios.join(' / ')} — selected in workbook: ${inv.selectedScenario}` : 'No scenario selector detected.'}</p>
                <p className="muted text-[12px]">{inv.assumptions.length} labelled assumptions with values per scenario (Scenario_Control).</p>
              </div>
              <div>
                <div className="label mb-1">Model review</div>
                <ul className="space-y-1.5 text-[13px]">
                  {review.map((r) => (
                    <li key={r.id}>
                      <Pill tone={r.severity === 'warning' ? 'warn' : r.severity === 'watch' ? 'accent' : 'neutral'}>{r.severity}</Pill> <b>{r.title}.</b> <span className="muted">{r.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          {rec.mismatched.length ? (
            <div>
              <div className="label mb-1">Differences (first 50)</div>
              <table className="table">
                <tbody>
                  {rec.mismatched.slice(0, 50).map((m) => (
                    <tr key={m.cell}>
                      <td>{m.cell}</td>
                      <td className="font-mono text-[11px]">{m.formula}</td>
                      <td className="num">{String(m.workbook)}</td>
                      <td className="num">{String(m.app)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {isThreeX ? (
            <div className="rounded-xl p-3" style={{ background: 'var(--card)' }}>
              <div className="h3">Create a workbook-baseline scenario</div>
              <p className="muted mt-1 text-[13px]">Uses the Large North American archetype for the Toronto events. Workbook values are preserved and labelled “workbook”; the men’s/women’s split of the combined archetype is your explicit assumption.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Segmented label="Workbook scenario" value={scenario} onChange={setScenario} options={[{ value: 'Conservative', label: 'Conservative' }, { value: 'Base', label: 'Base' }, { value: 'Exceeds', label: 'Exceeds' }]} />
                <label className="text-[13px]">
                  Men’s share {Math.round(menShare * 100)}%
                  <input type="range" min={0.2} max={0.8} step={0.05} value={menShare} onChange={(e: { target: HTMLInputElement }) => setMenShare(Number(e.target.value))} className="ml-2 align-middle" aria-label="Men’s share" />
                </label>
                <Button variant="primary" onClick={create} data-testid="wb-create">
                  Create scenario
                </Button>
                <Button icon="download" onClick={exportReport}>
                  Export reconciliation (XLSX)
                </Button>
              </div>
              {mapping.length ? <p className="muted mt-2 text-[12px]">{mapping.length} workbook cells mapped to app inputs (included in the export).</p> : null}
            </div>
          ) : (
            <Button icon="download" onClick={exportReport}>
              Export reconciliation (XLSX)
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
