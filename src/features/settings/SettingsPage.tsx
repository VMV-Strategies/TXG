import { useEffect, useRef, useState } from 'react';
import { Button, Callout, Card, Grid, NumberField, Page, Pill, Segmented, SelectField, TextField } from '../../components/ui';
import { useActive } from '../../hooks/useResult';
import { getState, init, saveFacts, setState, setUi, toast, updateScenario, useStore, type Fact } from '../../state/store';
import * as db from '../../storage/db';
import { base64, makeBackup, readBackup, type BackupData } from '../../storage/backup';
import { downloadBlob } from '../reports/exporters';
import { TAX_RULES } from '../../engines/tax/rules';
import { LIBRARY_SOURCES } from '../../data/sources';
import { isIos, isStandalone } from '../../app/pwa';
import { migrateScenario } from '../../state/migrate';
import type { Scenario } from '../../types/domain';
import { EXTENDED_YEARS } from '../../data/synthetic/defaultScenario';

export function SettingsPage() {
  const { scn } = useActive();
  const { theme, mode, currency, facts } = useStore((s) => ({ theme: s.theme, mode: s.mode, currency: s.currency, facts: s.facts }));
  const [info, setInfo] = useState<db.StorageInfo | null>(null);
  const [pass, setPass] = useState('');
  const [restorePass, setRestorePass] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const factRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void db.storageInfo().then(setInfo);
  }, []);
  const inv = scn.investor;
  const setInv = <K extends keyof typeof inv>(k: K, v: (typeof inv)[K]) => updateScenario((s) => void (s.investor[k] = v));

  const exportBackup = async () => {
    try {
      const [scenarios, documents, chunks, settings, factsAll, blobKeys] = await Promise.all([db.getAll('scenarios'), db.getAll('documents'), db.getAll('chunks'), db.get('settings', 'ui'), db.getAll('facts'), db.getAllKeys('blobs')]);
      const blobs: BackupData['blobs'] = [];
      for (const k of blobKeys) {
        const b = await db.get<Blob>('blobs', k);
        if (b) blobs.push({ key: String(k), base64: base64.enc(new Uint8Array(await b.arrayBuffer())) });
      }
      const file = await makeBackup({ scenarios, documents, chunks, blobs, settings: [{ key: 'ui', value: settings }], facts: factsAll }, pass || undefined);
      downloadBlob(new Blob([JSON.stringify(file)], { type: 'application/json' }), `threex-vi-backup-${new Date().toISOString().slice(0, 10)}${pass ? '-encrypted' : ''}.json`);
      toast(pass ? 'Encrypted backup downloaded. Keep the passphrase safe — it cannot be recovered.' : 'Backup downloaded (not encrypted).');
    } catch (e) {
      toast(`Backup failed: ${(e as Error).message}`);
    }
  };
  const restore = async (f: File) => {
    try {
      const rep = await readBackup(await f.text(), restorePass || undefined);
      if (!confirm(`Restore ${rep.data.scenarios.length} scenarios and ${rep.data.documents.length} documents? This replaces the data on this device.`)) return;
      for (const st of ['scenarios', 'documents', 'chunks', 'blobs', 'facts'] as const) await db.clearStore(st);
      const valid: unknown[] = [];
      for (const s of rep.data.scenarios) {
        try {
          valid.push(migrateScenario(s));
        } catch {
          rep.warnings.push('A scenario could not be migrated and was skipped.');
        }
      }
      await db.putMany('scenarios', valid);
      await db.putMany('documents', rep.data.documents);
      await db.putMany('chunks', rep.data.chunks);
      await db.putMany('facts', rep.data.facts);
      for (const b of rep.data.blobs) await db.put('blobs', new Blob([base64.dec(b.base64) as BlobPart]), b.key);
      const ui = rep.data.settings.find((s) => s.key === 'ui');
      if (ui) await db.put('settings', ui.value, 'ui');
      setState({ ready: false });
      await init();
      toast(`Restored${rep.migratedFrom ? ` (migrated from v${rep.migratedFrom})` : ''}.${rep.warnings.length ? ` ${rep.warnings.join(' ')}` : ''}`);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const importFacts = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      if (j.format !== 'threex-fact-pack') throw new Error('Not a THREE X fact pack.');
      const list = (j.facts ?? []) as Fact[];
      await saveFacts(list);
      if (j.foundation || j.entityPatches) {
        const scenarios = getState().scenarios.map((s) => {
          const c: Scenario = structuredClone(s);
          if (j.foundation) c.foundation = { ...c.foundation, ...j.foundation, governingDocsLoaded: true };
          for (const p of j.entityPatches ?? []) {
            const e = c.entities.find((x) => x.id === p.entityId);
            if (!e) continue;
            if (p.name) e.name = p.name;
            if (p.notes) e.notes = p.notes;
            if (p.evidence) e.evidence = p.evidence;
            if (p.tax) e.tax = { ...e.tax, ...p.tax };
          }
          return c;
        });
        setState({ scenarios });
        for (const s of scenarios) await db.put('scenarios', s);
      }
      toast(`Fact pack imported: ${list.length} facts, applied to all scenarios.`);
    } catch (e) {
      toast(`Fact pack: ${(e as Error).message}`);
    }
  };
  return (
    <Page title="Settings" subtitle="Appearance, assumptions, local storage, backup and restore, data deletion and installation.">
      <Grid cols={2}>
        <Card title="Appearance and explanations">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px]">Theme</span>
              <Segmented label="Theme" value={theme} onChange={(v) => setUi({ theme: v })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px]">Explanation mode</span>
              <Segmented label="Explanation mode" value={mode} onChange={(v) => setUi({ mode: v })} options={[{ value: 'simple', label: 'Simple' }, { value: 'business', label: 'Business' }, { value: 'expert', label: 'Expert' }]} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px]">Display currency</span>
              <Segmented label="Display currency" value={currency} onChange={(v) => setUi({ currency: v })} options={[{ value: 'CAD', label: 'CAD' }, { value: 'USD', label: 'USD' }]} />
            </div>
            <p className="muted text-[12px]">Changing the explanation mode or currency never changes the underlying calculation.</p>
          </div>
        </Card>
        <Card title="Scenario timing and FX" subtitle={scn.name}>
          <div className="grid grid-cols-3 gap-3">
            {scn.years.map((y) => (
              <NumberField key={y} label={`CAD per USD ${y}`} value={scn.fx.cadPerUsd[y] ?? 1.35} step={0.01} onChange={(v) => updateScenario((s) => void (s.fx.cadPerUsd = { ...s.fx.cadPerUsd, [y]: v }))} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <SelectField label="FX mode" value={scn.fx.mode} onChange={(v) => updateScenario((s) => void (s.fx.mode = v))} options={[{ value: 'forecast', label: 'Scenario forecast rates' }, { value: 'transaction', label: 'Transaction-date rates (where recorded)' }]} />
            <SelectField label="Monthly view year" value={String(scn.monthlyYear)} onChange={(v) => updateScenario((s) => void (s.monthlyYear = Number(v)))} options={scn.years.map((y) => ({ value: String(y), label: String(y) }))} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {scn.years.includes(EXTENDED_YEARS[0]) ? (
              <Button onClick={() => updateScenario((s) => void ((s.years = s.years.filter((y) => !EXTENDED_YEARS.includes(y))), s.events.forEach((e) => (e.years = e.years.filter((y) => !EXTENDED_YEARS.includes(y)))), (s.investor.exitYear = Math.min(s.investor.exitYear, 2029))))}>Remove 2030–2032 extension</Button>
            ) : (
              <a className="btn btn-secondary" href="#/events">
                Extend to 2030–2032 (Event Financials)
              </a>
            )}
          </div>
        </Card>
      </Grid>
      <Card title="Investor terms (private equity → Three X Global)" subtitle="Level 4 — investor returns. All values are assumptions until a term sheet exists.">
        <div className="grid gap-3 md:grid-cols-4">
          <SelectField label="Instrument" value={inv.instrument} onChange={(v) => updateScenario((s) => void ((s.investor.instrument = v), syncPeRel(s)))} options={[{ value: 'common', label: 'Common equity' }, { value: 'preferred', label: 'Preferred equity' }, { value: 'loan', label: 'Loan' }]} />
          <NumberField label="Investment (USD)" value={inv.investmentUsd} onChange={(v) => updateScenario((s) => void ((s.investor.investmentUsd = v), syncPeRel(s)))} />
          <NumberField label="Economic ownership of Three X Global" percent value={inv.ownershipPct} onChange={(v) => setInv('ownershipPct', v)} />
          <NumberField label="Distribution policy" percent value={inv.distributionPolicy} onChange={(v) => setInv('distributionPolicy', v)} />
          <NumberField label="Preferred return" percent value={inv.prefRate} onChange={(v) => setInv('prefRate', v)} />
          <NumberField label="Loan rate" percent value={inv.loanRate} onChange={(v) => updateScenario((s) => void ((s.investor.loanRate = v), syncPeRel(s)))} />
          <SelectField label="Exit year" value={String(inv.exitYear)} onChange={(v) => setInv('exitYear', Number(v))} options={scn.years.map((y) => ({ value: String(y), label: String(y) }))} />
          <NumberField label="Exit multiple (× EBITDA)" value={inv.exitMultiple} step={0.5} onChange={(v) => setInv('exitMultiple', v)} />
          <NumberField label="Investor tax rate (after-tax view)" percent value={inv.investorTaxRate} onChange={(v) => setInv('investorTaxRate', v)} />
        </div>
      </Card>
      <Grid cols={2}>
        <Card title="Local storage" subtitle="Your scenarios, documents and facts live in this browser (IndexedDB).">
          {info ? (
            <div className="space-y-2 text-[14px]">
              <div className="h-2 rounded-full" style={{ background: 'var(--line)' }}>
                <div className="h-2 rounded-full" style={{ width: `${Math.min(100, info.pct * 100)}%`, background: info.pct > 0.8 ? 'var(--bad)' : 'var(--accent)' }} />
              </div>
              <p>
                {(info.usage / 1024 / 1024).toFixed(1)} MB used of {info.quota ? `${(info.quota / 1024 / 1024).toFixed(0)} MB available` : 'unknown capacity'} · persistent: {info.persisted === null ? 'unknown' : info.persisted ? 'yes' : 'no'}
              </p>
              {info.warning ? <Callout tone="warn">{info.warning}</Callout> : null}
              <Button onClick={async () => (toast((await db.requestPersistence()) ? 'Storage marked persistent.' : 'The browser declined persistent storage (installing to the Home Screen helps on iOS).'), setInfo(await db.storageInfo()))}>Request persistent storage</Button>
            </div>
          ) : (
            <p className="muted">Checking…</p>
          )}
        </Card>
        <Card title="Backup and restore">
          <div className="space-y-3">
            <TextField label="Passphrase for encrypted backup (optional, ≥ 8 characters)" value={pass} onChange={setPass} />
            <Button variant="primary" icon="download" onClick={exportBackup} data-testid="backup-export">
              Export backup{pass ? ' (encrypted)' : ''}
            </Button>
            <hr className="hairline" />
            <TextField label="Passphrase (if the backup is encrypted)" value={restorePass} onChange={setRestorePass} />
            <Button icon="upload" onClick={() => fileRef.current?.click()}>
              Restore from backup…
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" data-testid="backup-input" onChange={(e: { target: HTMLInputElement }) => e.target.files?.[0] && void restore(e.target.files[0])} />
            <p className="muted text-[12px]">Backups use AES-GCM with a PBKDF2 (250,000 iterations) key when a passphrase is set. Invalid records in a backup are skipped with a warning; older backup versions are migrated.</p>
          </div>
        </Card>
      </Grid>
      <Grid cols={2}>
        <Card title="Private fact pack" subtitle="Corporate facts verified from your filings — imported locally, never bundled with the app.">
          <p className="text-[14px]">{facts.length ? `${facts.length} facts loaded.` : 'No fact pack loaded.'}</p>
          {facts.length ? (
            <div className="mt-2 max-h-64 overflow-y-auto">
              <table className="table">
                <tbody>
                  {facts.map((f) => (
                    <tr key={f.id}>
                      <td className="text-[12px]">{f.entity}</td>
                      <td className="text-[12px]">{f.field}</td>
                      <td className="text-[12px]">{f.sensitive ? '•••• (sensitive)' : f.value}</td>
                      <td>
                        <Pill tone={f.status === 'verified' ? 'good' : f.status === 'inconsistent' ? 'bad' : 'warn'}>{f.status}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button icon="upload" onClick={() => factRef.current?.click()} data-testid="factpack-import">
              Import fact pack…
            </Button>
            <input ref={factRef} type="file" accept="application/json,.json" className="hidden" onChange={(e: { target: HTMLInputElement }) => e.target.files?.[0] && void importFacts(e.target.files[0])} />
          </div>
        </Card>
        <Card title="Delete all data" subtitle="Removes every scenario, document, fact and setting from this device.">
          <TextField label='Type DELETE to confirm' value={confirmText} onChange={setConfirmText} testId="delete-confirm" />
          <div className="mt-3">
            <Button
              variant="danger"
              icon="trash"
              disabled={confirmText !== 'DELETE'}
              data-testid="delete-all"
              onClick={async () => {
                await db.deleteEverything();
                setConfirmText('');
                setState({ ready: false, docs: [], facts: [] });
                await init();
                toast('All local data deleted. Demonstration scenarios were restored.');
              }}
            >
              Delete everything
            </Button>
          </div>
        </Card>
      </Grid>
      <Card title="Install on iPhone" subtitle={isStandalone() ? 'Running as an installed app.' : 'Add to Home Screen for an app-like, offline experience.'}>
        <ol className="list-decimal space-y-1 pl-5 text-[14px]">
          <li>Open this app in Safari.</li>
          <li>Tap Share.</li>
          <li>Choose “Add to Home Screen”.</li>
          <li>Confirm installation.</li>
          <li>Open the new Home Screen icon.</li>
        </ol>
        <p className="muted mt-2 text-[12px]">
          {isIos() ? 'On iOS, ' : ''}After the first online visit the app reopens offline. iOS keeps a separate storage area for the installed app (data in Safari tabs is not shared with the Home Screen app), and Safari may clear data for websites not used for seven days — installed apps and regular backups avoid surprises.
        </p>
      </Card>
      <Card title="Knowledge freshness and sources">
        <p className="text-[14px]">Tax rules reviewed: {Array.from(new Set(TAX_RULES.map((t) => t.reviewedOn))).join(', ')}. Library sources registered: {LIBRARY_SOURCES.length}.</p>
        <ul className="muted mt-2 list-disc space-y-1 pl-5 text-[12px]">
          {LIBRARY_SOURCES.filter((s) => !s.private).map((s) => (
            <li key={s.id}>
              {s.title} — {s.currency}
            </li>
          ))}
        </ul>
        <p className="muted mt-3 text-[12px]">
          Version {__APP_VERSION__} · built {__BUILD_TIME__} · no data leaves this device unless you export it.
        </p>
      </Card>
    </Page>
  );
}

function syncPeRel(s: Scenario) {
  const pe = s.roles.investor;
  const txg = s.roles.usVenture;
  const r = s.relationships.find((x) => x.from === pe && x.to === txg);
  const inv = s.investor;
  const type = inv.instrument === 'loan' ? 'third-party-loan' : inv.instrument === 'preferred' ? 'preferred-shares' : 'common-shares';
  const rel = r ?? { id: 'r-pe', from: pe, to: txg, currency: 'USD' as const, amount: 0, startYear: s.years[0], evidence: 'assumption' as const, type };
  rel.type = type;
  rel.amount = inv.investmentUsd;
  rel.currency = 'USD';
  if (type === 'third-party-loan') {
    rel.loan = { rate: inv.loanRate, termYears: Math.max(1, inv.exitYear - rel.startYear + 1), repayment: 'maturity', cashInterest: true };
    delete rel.equity;
  } else {
    rel.equity = { shares: 400, votesPerShare: 1, classLabel: inv.instrument === 'preferred' ? 'Preferred units' : 'Membership units', prefRate: inv.instrument === 'preferred' ? inv.prefRate : undefined, prefCumulative: true };
    delete rel.loan;
  }
  if (!r) s.relationships.push(rel);
}
