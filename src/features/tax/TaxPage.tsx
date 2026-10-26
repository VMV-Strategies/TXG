import { useState, type ReactNode } from 'react';
import { Callout, Card, Grid, NumberField, Page, Pill, SelectField, SourceLinks, StatusBadge, Term, Toggle, ExplainButton } from '../../components/ui';
import { openOverlay } from '../../components/overlay';
import { useActive } from '../../hooks/useResult';
import { updateScenario, useStore } from '../../state/store';
import { money, pct, toDisplay } from '../../utils/format';
import { TAX_RULES, ruleValue } from '../../engines/tax/rules';
import { sum } from '../../engines/finance/finance';
import { nameOf } from '../money-flow/MoneyFlowPage';
import { adhoc } from '../dashboard/OverviewPage';
import type { Flow } from '../../engines/scenarios/compute';

const REPORTING: Record<string, string> = {
  interest: 'NR4 slip/return if Part XIII applies; T106 if reportable transactions with non-arm’s-length non-residents exceed $1M; U.S.: Form 1118 (corporation) or 1116 (individuals) for credits.',
  dividend: 'NR4 slip/return; NR301/NR302 from the recipient to support treaty rate; U.S.: Form 5471 (10% U.S. shareholders).',
  'deemed-dividend': 'NR4 slip/return; thin-cap computation retained.',
  'management-fee': 'Reg. 105 remittance and T4A-NR (services in Canada); NR4 if Part XIII applies; T106; transfer-pricing documentation (s. 247).',
  royalty: 'NR4 slip/return; T106; licence agreement and benchmarking.',
  'revenue-share': 'Depends on characterisation: NR4 (withholding) or Canadian tax returns by the U.S. party (PE/partnership).',
  'service-fee': 'Contract and invoice support.',
};

export function TaxPage() {
  const { scn, result: r } = useActive();
  const cur = useStore((s) => s.currency);
  const mode = useStore((s) => s.mode);
  const [showRules, setShowRules] = useState(mode === 'expert');
  const d = (n: number, y?: number) => toDisplay(n, cur, r, y);
  const caEntities = scn.entities.filter((e) => e.inGroup && e.jurisdiction === 'CA' && e.kind === 'ca-corp');
  const usEntities = scn.entities.filter((e) => e.inGroup && e.kind === 'us-llc');
  const cross = r.flows.filter((f) => scn.entities.find((e) => e.id === f.from)?.tax.residence === 'CA' && scn.entities.find((e) => e.id === f.to)?.tax.residence === 'US' && !f.capital);
  const ts = scn.taxSettings;
  const leakage = adhoc('tax.leakage', 'Total estimated tax leakage', r.group.totalTax, {
    what: 'All income taxes paid by the group in both countries, including final withholding.',
    why: 'This is the number a structure is trying to reduce — but only legally and with support.',
    formula: 'Canadian corporate tax + final withholding + U.S. tax',
    inputs: [
      { label: 'Canadian corporate tax', value: Math.round(r.group.canadianCorporateTax) },
      { label: 'Final withholding', value: Math.round(r.group.withholdingFinal) },
      { label: 'U.S. tax', value: Math.round(r.group.usTax) },
      { label: 'Recoverable Reg. 105 (temporary)', value: Math.round(r.group.withholdingRecoverable) },
    ],
    taxes: r.comparison ? `Compared with plain equity: ${money(r.comparison.delta, 'CAD', { sign: true })}. ${r.comparison.delta < 0 ? 'Saving' : 'Cost'} by entity: ${Object.entries(r.comparison.deltaByEntity).map(([k, v]) => `${nameOf(k, scn.entities)} ${money(v, 'CAD', { sign: true })}`).join('; ')}.` : '',
    watch: 'A saving in one entity often appears as tax in another (e.g., a Canadian deduction becomes U.S. income). Check the by-entity split.',
  });
  return (
    <Page title="Tax Intelligence" subtitle="Deterministic, source-linked Canadian and U.S. tax for this scenario. Rules are versioned by year; anything unverified for a forecast year is flagged.">
      <Callout tone="warn" title="Not tax advice">
        This engine applies the rules it implements to the facts you enter. Where the outcome depends on facts not yet confirmed (LLC classification, members, control, contract terms), it shows a conditional result and says so. Have a Canadian and a U.S. tax adviser confirm before implementing.
      </Callout>
      <Card title="Summary" actions={<ExplainButton metric={leakage} label="Explain" />}>
        <Grid cols={4}>
          <Big label="Canadian corporate tax" v={money(d(r.group.canadianCorporateTax), cur)} />
          <Big label={<><Term t="Part XIII tax">Withholding</Term> (final)</>} v={money(d(r.group.withholdingFinal), cur)} />
          <Big label={<><Term t="Regulation 105">Reg. 105</Term> (temporary)</>} v={money(d(r.group.withholdingRecoverable), cur)} />
          <Big label="U.S. tax (entity or members)" v={money(d(r.group.usTax), cur)} />
          <Big label="Total tax leakage" v={money(d(r.group.totalTax), cur)} strong />
          <Big label="Canadian after-tax profit (operator)" v={money(d(sum((r.entityYears[scn.roles.operator] ?? []).map((x) => x.netIncome))), cur)} />
          <Big label="U.S. after-tax profit (Three X Global)" v={money(d(r.group.txgAfterTax), cur)} />
          <Big label="Shift vs. plain equity" v={r.comparison ? money(d(r.comparison.delta), cur, { sign: true }) : '—'} />
        </Grid>
        {r.comparison ? (
          <p className="muted mt-3 text-[13px]">
            Does this structure reduce the group’s taxes or just shift them? Compared with “{r.comparison.label}”, total tax changes by {money(d(r.comparison.delta), cur, { sign: true })}:{' '}
            {Object.entries(r.comparison.deltaByEntity)
              .map(([k, v]) => `${nameOf(k, scn.entities)} ${money(d(v), cur, { sign: true })}`)
              .join(' · ')}
            .
          </p>
        ) : null}
      </Card>

      <Card title="Assumptions that drive tax">
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField label="Small business deduction" value={ts.sbdTreatment} onChange={(v) => updateScenario((s) => void (s.taxSettings.sbdTreatment = v))} options={[{ value: 'auto', label: 'Auto — only if control analysis supports CCPC' }, { value: 'assume-eligible', label: 'Assume eligible (override)' }, { value: 'assume-ineligible', label: 'Assume not eligible' }]} hint={`Control analysis: ${r.control.status}`} />
          <SelectField label="LLC with unknown classification — illustrate as" value={scn.assumptions.usUnknownAs} onChange={(v) => updateScenario((s) => void (s.assumptions.usUnknownAs = v))} options={[{ value: 'pass-through', label: 'Pass-through (default rule for multi-member LLC)' }, { value: 'corporation', label: 'Corporation (if Form 8832 filed)' }]} />
          <NumberField label="CCA proxy (years, straight-line)" value={ts.ccaYears} onChange={(v) => updateScenario((s) => void (s.taxSettings.ccaYears = Math.max(1, Math.round(v))))} />
          <Toggle label="Treaty benefits claimed (NR301/NR302 on file)" checked={ts.treatyClaimed} onChange={(v) => updateScenario((s) => void (s.taxSettings.treatyClaimed = v))} />
          <Toggle label="Risk case: deny deductions for undocumented intercompany fees" checked={ts.disallowUndocumentedFees} onChange={(v) => updateScenario((s) => void (s.taxSettings.disallowUndocumentedFees = v))} />
        </div>
      </Card>

      {caEntities.map((e) => (
        <Card key={e.id} title={`Canada — ${e.name}`} subtitle="Federal and Ontario corporate income tax. Tap a year for the step-by-step calculation.">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th className="num">Income before tax</th>
                  <th className="num">Non-deductible interest</th>
                  <th className="num">Losses used</th>
                  <th className="num">Taxable income</th>
                  <th className="num">SBD income</th>
                  <th className="num">Federal</th>
                  <th className="num">Ontario</th>
                  <th className="num">Total</th>
                  <th>Verified</th>
                </tr>
              </thead>
              <tbody>
                {(r.entityYears[e.id] ?? []).map((x) => (
                  <tr
                    key={x.year}
                    className="cursor-pointer"
                    onClick={() =>
                      x.caTax &&
                      openOverlay({
                        kind: 'metric',
                        metric: adhoc(`ca-${e.id}-${x.year}`, `${e.name} — tax ${x.year}`, x.caTax.totalTax, { year: x.year, what: `Federal and Ontario corporate income tax for ${x.year}.`, formula: x.caTax.steps.map((s) => `${s.label}: ${s.formula}`).join('\n'), inputs: x.caTax.steps.map((s) => ({ label: s.label, value: Math.round(s.value) })), sources: x.caTax.sources, status: x.caTax.verified ? 'legislation' : 'conditional', taxes: x.caTax.notes.join(' '), watch: 'Ontario rates for forecast years assume no change in law.' }),
                      })
                    }
                  >
                    <td>{x.year}</td>
                    <td className="num">{money(d(x.incomeBeforeTax, x.year), cur, { compact: true })}</td>
                    <td className="num">{money(d(x.nonDeductibleInterest, x.year), cur, { compact: true })}</td>
                    <td className="num">{money(d(x.caTax?.lossUsed ?? 0, x.year), cur, { compact: true })}</td>
                    <td className="num">{money(d(x.caTax?.taxableIncome ?? 0, x.year), cur, { compact: true })}</td>
                    <td className="num">{money(d(x.caTax?.sbdIncome ?? 0, x.year), cur, { compact: true })}</td>
                    <td className="num">{money(d(x.caTax?.federalTax ?? 0, x.year), cur, { compact: true })}</td>
                    <td className="num">{money(d(x.caTax?.ontarioTax ?? 0, x.year), cur, { compact: true })}</td>
                    <td className="num font-semibold">{money(d(x.incomeTax, x.year), cur, { compact: true })}</td>
                    <td>{x.caTax?.verified ? <Pill tone="good">enacted</Pill> : <Pill tone="warn">forecast</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted mt-2 text-[12px]">
            Loss carryforward closing: {money(d((r.entityYears[e.id] ?? []).slice(-1)[0]?.caTax?.lossPoolClosing ?? 0), cur)} · Business limit used: {money(d((r.entityYears[e.id] ?? [])[0]?.caTax?.businessLimit ?? 0), cur)} · <Term t="Thin capitalization" /> and <Term t="EIFEL" /> applied where relevant.
          </p>
        </Card>
      ))}

      <Card title="Cross-border payments (Canada → United States)" subtitle="For each payment: nature, parties, beneficial owner, residence, source, withholding, deductibility, treaty eligibility, characterisation, reporting and timing." pad={false}>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="table" data-testid="crossborder-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Nature</th>
                <th>Payer → recipient</th>
                <th>Beneficial owner / residence</th>
                <th className="num">Gross</th>
                <th className="num">Domestic</th>
                <th className="num">Treaty</th>
                <th className="num">Applied</th>
                <th className="num">Withheld</th>
                <th>Permanent?</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {cross.map((f) => (
                <CrossRow key={f.id} f={f} names={scn.entities} d={d} cur={cur} />
              ))}
              {!cross.length ? (
                <tr>
                  <td colSpan={11} className="muted">
                    No payments from Canada to the U.S. in this scenario.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {usEntities.map((e) => {
        const rows = r.entityYears[e.id] ?? [];
        return (
          <Card key={e.id} title={`United States — ${e.name}`} subtitle={<>Classification: <b>{e.tax.usClassification ?? 'unknown'}</b>. <Term t="Disregarded entity">Do not assume an LLC is taxed as a corporation.</Term></>}>
            {(!e.tax.usClassification || e.tax.usClassification === 'unknown') && rows[0]?.usTaxAlt ? (
              <Callout tone="warn" title="Conditional result">
                Classification is unknown. Primary view: <b>{rows[0].usTax?.classification}</b>. The alternative view is shown alongside for comparison.
              </Callout>
            ) : null}
            <div className="mt-3 overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>View</th>
                    <th className="num">Gross income</th>
                    <th className="num">§245A DRD</th>
                    <th className="num">Taxable</th>
                    <th className="num">Before credits</th>
                    <th className="num">FTC</th>
                    <th className="num">Federal / members</th>
                    <th className="num">New York</th>
                    <th className="num">Uncredited foreign tax</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.flatMap((x) =>
                    [x.usTax, x.usTaxAlt].filter(Boolean).map((t, k) => (
                      <tr key={`${x.year}-${k}`} style={k ? { opacity: 0.7 } : undefined}>
                        <td>{k ? '' : x.year}</td>
                        <td>
                          {t!.classification}
                          {k ? ' (alt.)' : ''}
                        </td>
                        <td className="num">{money(d(t!.grossIncome * r.fx[x.year], x.year), cur, { compact: true })}</td>
                        <td className="num">{money(d(t!.drd245A * r.fx[x.year], x.year), cur, { compact: true })}</td>
                        <td className="num">{money(d(t!.taxableIncome * r.fx[x.year], x.year), cur, { compact: true })}</td>
                        <td className="num">{money(d(t!.federalBeforeCredits * r.fx[x.year], x.year), cur, { compact: true })}</td>
                        <td className="num">{money(d(t!.ftc * r.fx[x.year], x.year), cur, { compact: true })}</td>
                        <td className="num">{money(d((t!.federal + t!.memberLevelTax) * r.fx[x.year], x.year), cur, { compact: true })}</td>
                        <td className="num">{money(d(t!.state * r.fx[x.year], x.year), cur, { compact: true })}</td>
                        <td className="num">{money(d(t!.uncreditedForeignTax * r.fx[x.year], x.year), cur, { compact: true })}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            <ul className="muted mt-3 list-disc space-y-1 pl-5 text-[13px]">
              {Array.from(new Set(rows.flatMap((x) => x.usTax?.notes ?? []))).map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <div className="mt-2">
              <SourceLinks refs={rows[0]?.usTax?.sources ?? []} />
            </div>
          </Card>
        );
      })}

      <Card title="Tax rule register" subtitle="Every rule the engine uses, with authority, effective dates, verified years, confidence and review status." actions={<button type="button" className="btn btn-ghost" onClick={() => setShowRules(!showRules)}>{showRules ? 'Hide' : 'Show'}</button>}>
        <KnowledgeFreshness years={r.years} />
        {showRules ? (
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Jurisdiction</th>
                  <th>Authority</th>
                  <th>Effective</th>
                  {r.years.map((y) => (
                    <th key={y} className="num">
                      {y}
                    </th>
                  ))}
                  <th>Confidence</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {TAX_RULES.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="font-medium">{t.name}</div>
                      <div className="muted text-[12px]">{t.methodology}</div>
                    </td>
                    <td>{t.jurisdiction}</td>
                    <td>
                      <SourceLinks refs={t.authority.map((a) => ({ id: a, label: a }))} />
                    </td>
                    <td className="whitespace-nowrap">{t.effectiveFrom}</td>
                    {r.years.map((y) => {
                      const v = ruleValue(t.id, y);
                      return (
                        <td key={y} className="num" title={v.note}>
                          {t.currency ? money(v.value, t.currency) : t.id.includes('carryforward') ? `${v.value} yrs` : t.id.includes('thin') ? `${v.value}:1` : pct(v.value, 2)}
                          {!v.verified ? <span style={{ color: 'var(--warn)' }}> *</span> : null}
                        </td>
                      );
                    })}
                    <td>
                      <Pill tone={t.confidence === 'high' ? 'good' : t.confidence === 'medium' ? 'warn' : 'bad'}>{t.confidence}</Pill>
                    </td>
                    <td className="text-[12px]">
                      <StatusBadge status={t.reviewStatus === 'verified-against-source' ? 'legislation' : t.reviewStatus === 'verified-secondary' ? 'official-rule' : 'assumption'} label={t.reviewStatus.replace(/-/g, ' ')} />
                      <div className="muted">{t.reviewedOn}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted mt-2 text-[12px]">* Not verified as enacted for that year — the value assumes current law continues.</p>
          </div>
        ) : null}
      </Card>
    </Page>
  );
}

function Big({ label, v, strong }: { label: ReactNode; v: string; strong?: boolean }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`mt-0.5 tabular-nums ${strong ? 'text-[24px] font-bold' : 'text-[20px] font-semibold'}`}>{v}</div>
    </div>
  );
}

function CrossRow({ f, names, d, cur }: { f: Flow; names: { id: string; name: string; tax: { usClassification?: string; memberUsResidentShare?: number } }[]; d: (n: number, y?: number) => number; cur: 'CAD' | 'USD' }) {
  const w = f.withholdingDetail;
  const rec = names.find((n) => n.id === f.to);
  const bo = rec?.tax.usClassification === 'corporation' ? `${rec.name} (U.S. company)` : `${rec?.name ?? f.to} members (${Math.round((rec?.tax.memberUsResidentShare ?? 1) * 100)}% U.S.)`;
  return (
    <>
      <tr className="cursor-pointer" onClick={() => openOverlay({ kind: 'flow', flow: f })}>
        <td>{f.year}</td>
        <td>{f.kind.replace(/-/g, ' ')}</td>
        <td>
          {nameOf(f.from, names)} → {nameOf(f.to, names)}
        </td>
        <td className="text-[12px]">{bo} · source: Canada</td>
        <td className="num">{money(d(f.gross, f.year), cur, { compact: true })}</td>
        <td className="num">{w ? pct(w.domesticRate) : '—'}</td>
        <td className="num">{w?.treatyRate === null || !w ? 'n/a' : pct(w.treatyRate)}</td>
        <td className="num">{w?.appliedRate === null || !w ? 'not computed' : pct(w.appliedRate)}</td>
        <td className="num">{money(d(f.withholding, f.year), cur, { compact: true })}</td>
        <td>{w?.permanence === 'final' ? 'Permanent' : w?.permanence === 'refundable' ? 'Temporary' : w?.permanence === 'unsupported' ? 'Unresolved' : 'None'}</td>
        <td>
          <Pill tone={w?.confidence === 'high' ? 'good' : w?.confidence === 'medium' ? 'warn' : 'bad'}>{w?.confidence ?? 'n/a'}</Pill>
        </td>
      </tr>
      <tr>
        <td />
        <td colSpan={10} className="muted text-[12px]">
          Deductible to payer: {f.kind === 'dividend' ? 'No (after-tax distribution)' : 'Generally yes, subject to thin cap, EIFEL, transfer pricing'} · U.S. character: {f.kind === 'dividend' ? 'foreign dividend' : f.kind === 'interest' ? 'foreign-source interest' : f.kind === 'royalty' ? 'foreign-source royalty' : 'business income (sourcing depends on where services are performed)'} · Reporting: {REPORTING[f.kind] ?? '—'} · Timing: withholding due by the 15th of the month after payment.
        </td>
      </tr>
    </>
  );
}

function KnowledgeFreshness({ years }: { years: number[] }) {
  const unverified = TAX_RULES.filter((t) => years.some((y) => !ruleValue(t.id, y).verified));
  return unverified.length ? (
    <Callout tone="warn" title={`${unverified.length} rules are not verified for every selected year`}>
      Forecast years ({years.filter((y) => y > 2026).join(', ')}) use the most recent enacted values. Re-verify each rule when budgets are tabled. Last full review: 2026-10-25.
    </Callout>
  ) : (
    <Callout tone="good">All rules verified for the selected years.</Callout>
  );
}
