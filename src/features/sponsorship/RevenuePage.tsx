import { useMemo } from 'react';
import type { SponsorDeal } from '../../types/domain';
import { Button, Callout, Card, Grid, Page, Pill, Segmented } from '../../components/ui';
import { BarChart } from '../../components/charts';
import { useActive } from '../../hooks/useResult';
import { updateScenario, useStore } from '../../state/store';
import { money, pct, toDisplay } from '../../utils/format';
import { sponsorValue } from '../../engines/events/events';
import { computeScenario } from '../../engines/scenarios/compute';
import { sum } from '../../engines/finance/finance';

const TIERS: SponsorDeal['tier'][] = ['naming', 'presenting', 'category', 'official-supplier', 'corporate-partner', 'media', 'community', 'activation', 'in-kind'];
const STATUSES: SponsorDeal['status'][] = ['prospect', 'proposal', 'negotiating', 'signed', 'lost'];

export function RevenuePage() {
  const { scn, result: r } = useActive();
  const cur = useStore((s) => s.currency);
  const d = (n: number) => toDisplay(n, cur, r);
  const basis = scn.assumptions.sponsorshipBasis;
  const deals = scn.sponsors;
  const tot = (b: 'expected' | 'confirmed' | 'proposed') => sum(deals.map((x) => sponsorValue(x, b)));
  const cash = sum(deals.filter((x) => x.cash).map((x) => sponsorValue(x, basis)));
  const inKind = sum(deals.filter((x) => !x.cash).map((x) => sponsorValue(x, basis)));
  const missed = useMemo(() => computeScenario({ ...scn, assumptions: { ...scn.assumptions, sponsorshipBasis: 'confirmed' } }, { skipComparison: true }), [scn]);
  const op = scn.roles.operator;
  const endCash = (x: typeof r) => (x.entityYears[op] ?? []).slice(-1)[0]?.closingCash ?? 0;
  const set = (id: string, f: (d: SponsorDeal) => void) => updateScenario((s) => void f(s.sponsors.find((x) => x.id === id)!));
  const add = () =>
    updateScenario((s) =>
      void s.sponsors.push({ id: `s${Date.now().toString(36)}`, name: 'New sponsor', tier: 'corporate-partner', proposed: 50000, confirmed: 0, cash: true, status: 'prospect', probability: 0.3, paymentMonth: 6, exclusivity: false, termYears: 1, fibaRightsConflict: 'unknown', eventId: s.events[0]?.id }),
    );
  return (
    <Page title="Revenue & Sponsorship" subtitle="Sponsorship pipeline, ticketing and other revenue. Unsigned deals are never treated as confirmed: choose how to count them." actions={<Segmented label="Count sponsorship as" value={basis} onChange={(v) => updateScenario((s) => void (s.assumptions.sponsorshipBasis = v))} options={[{ value: 'confirmed', label: 'Signed only' }, { value: 'expected', label: 'Probability-weighted' }, { value: 'proposed', label: 'Full proposed' }]} />}>
      <Card>
        <Grid cols={4}>
          <Stat label="Proposed (all deals, per year)" v={money(d(tot('proposed')), cur)} />
          <Stat label="Confirmed (signed)" v={money(d(tot('confirmed')), cur)} />
          <Stat label="Probability-weighted" v={money(d(tot('expected')), cur)} />
          <Stat label={`Cash / in-kind (${basis})`} v={`${money(d(cash), cur, { compact: true })} / ${money(d(inKind), cur, { compact: true })}`} />
        </Grid>
      </Card>
      <Card title="Sponsorship pipeline" subtitle="Values are per event-year. FIBA owns Pro Circuit commercial rights — confirm each category is available to the host." actions={<Button icon="plus" onClick={add}>Add sponsor</Button>} pad={false}>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="table" data-testid="sponsor-table">
            <thead>
              <tr>
                <th>Sponsor</th>
                <th>Tier</th>
                <th>Event</th>
                <th className="num">Proposed</th>
                <th className="num">Confirmed</th>
                <th>Cash?</th>
                <th>Status</th>
                <th className="num">Probability</th>
                <th className="num">Pay month</th>
                <th>Exclusive</th>
                <th className="num">Term</th>
                <th>FIBA conflict?</th>
                <th className="num">Counted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {deals.map((x) => (
                <tr key={x.id}>
                  <td>
                    <input className="input min-w-[180px]" value={x.name} onChange={(e: { target: HTMLInputElement }) => set(x.id, (y) => void (y.name = e.target.value))} aria-label="Sponsor name" />
                  </td>
                  <td>
                    <select className="input" value={x.tier} onChange={(e: { target: HTMLSelectElement }) => set(x.id, (y) => void (y.tier = e.target.value as SponsorDeal['tier']))} aria-label="Tier">
                      {TIERS.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select className="input" value={x.eventId ?? ''} onChange={(e: { target: HTMLSelectElement }) => set(x.id, (y) => void (y.eventId = e.target.value))} aria-label="Event">
                      {scn.events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <input className="input num w-28" inputMode="decimal" value={x.proposed} onChange={(e: { target: HTMLInputElement }) => set(x.id, (y) => void (y.proposed = Number(e.target.value) || 0))} aria-label="Proposed value" />
                  </td>
                  <td className="num">
                    <input className="input num w-28" inputMode="decimal" value={x.confirmed} onChange={(e: { target: HTMLInputElement }) => set(x.id, (y) => void (y.confirmed = Number(e.target.value) || 0))} aria-label="Confirmed value" />
                  </td>
                  <td>
                    <input type="checkbox" checked={x.cash} onChange={(e: { target: HTMLInputElement }) => set(x.id, (y) => void (y.cash = e.target.checked))} aria-label="Cash" />
                  </td>
                  <td>
                    <select className="input" value={x.status} onChange={(e: { target: HTMLSelectElement }) => set(x.id, (y) => void ((y.status = e.target.value as SponsorDeal['status']), y.status === 'signed' && !y.confirmed && (y.confirmed = y.proposed)))} aria-label="Status" data-testid={`sponsor-status-${x.id}`}>
                      {STATUSES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <input className="input num w-16" inputMode="decimal" value={Math.round(x.probability * 100)} onChange={(e: { target: HTMLInputElement }) => set(x.id, (y) => void (y.probability = Math.min(1, Math.max(0, (Number(e.target.value) || 0) / 100))))} aria-label="Probability %" />
                  </td>
                  <td className="num">
                    <input className="input num w-14" inputMode="numeric" value={x.paymentMonth} onChange={(e: { target: HTMLInputElement }) => set(x.id, (y) => void (y.paymentMonth = Math.min(12, Math.max(1, Number(e.target.value) || 1))))} aria-label="Payment month" />
                  </td>
                  <td>
                    <input type="checkbox" checked={x.exclusivity} onChange={(e: { target: HTMLInputElement }) => set(x.id, (y) => void (y.exclusivity = e.target.checked))} aria-label="Exclusive" />
                  </td>
                  <td className="num">{x.termYears} yr</td>
                  <td>
                    <select className="input" value={x.fibaRightsConflict} onChange={(e: { target: HTMLSelectElement }) => set(x.id, (y) => void (y.fibaRightsConflict = e.target.value as SponsorDeal['fibaRightsConflict']))} aria-label="FIBA conflict">
                      <option value="unknown">unknown</option>
                      <option value="no">no</option>
                      <option value="yes">yes</option>
                    </select>
                  </td>
                  <td className="num font-medium">{money(d(sponsorValue(x, basis)), cur, { compact: true })}</td>
                  <td>
                    <button type="button" className="btn btn-ghost px-2" onClick={() => updateScenario((s) => ({ ...s, sponsors: s.sponsors.filter((y) => y.id !== x.id) }))} aria-label="Remove sponsor">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted px-5 pb-4 text-[12px]">Revenue recognition: cash received before the event is deferred revenue and recognised when the event is delivered; in-kind sponsorship is recorded as revenue with an equal cost. HST applies to sponsorship fees.</p>
      </Card>
      <Grid cols={2}>
        <Card title="If sponsorship targets are missed" subtitle="Same scenario counting only signed sponsorship">
          <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th />
                <th className="num">Current basis</th>
                <th className="num">Signed only</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Event revenue</td>
                <td className="num">{money(d(sum(r.events.map((e) => e.revenueTotal))), cur, { compact: true })}</td>
                <td className="num">{money(d(sum(missed.events.map((e) => e.revenueTotal))), cur, { compact: true })}</td>
              </tr>
              <tr>
                <td>Cumulative cash need</td>
                <td className="num">{money(d(r.cumulativeCashNeed), cur, { compact: true })}</td>
                <td className="num">{money(d(missed.cumulativeCashNeed), cur, { compact: true })}</td>
              </tr>
              <tr>
                <td>Operator closing cash</td>
                <td className="num">{money(d(endCash(r)), cur, { compact: true })}</td>
                <td className="num" style={{ color: endCash(missed) < 0 ? 'var(--bad)' : undefined }}>
                  {money(d(endCash(missed)), cur, { compact: true })}
                </td>
              </tr>
              <tr>
                <td>Investor IRR</td>
                <td className="num">{r.investor.irr === null ? '—' : pct(r.investor.irr)}</td>
                <td className="num">{missed.investor.irr === null ? '—' : pct(missed.investor.irr)}</td>
              </tr>
            </tbody>
          </table>
          </div>
          {endCash(missed) < 0 ? (
            <Callout tone="warn" title="Funding strategy if targets are missed">
              Additional funding of about {money(d(-endCash(missed)), cur)} would be required. Options: stage launch spending behind sponsor signatures (launch gates), negotiate FIBA fee instalments, secure a committed bridge facility, or run a single event in year one.
            </Callout>
          ) : (
            <Callout tone="good">The current capital covers the plan even with signed sponsorship only.</Callout>
          )}
        </Card>
        <Card title="Ticketing and other revenue by event-year">
          <BarChart ariaLabel="Revenue mix" stacked categories={r.events.map((e) => `${e.gender === 'women' ? 'W' : 'M'} ${e.year}`)} series={[{ name: 'Sponsorship', values: r.events.map((e) => d(e.sponsorCash)) }, { name: 'Tickets & hospitality', values: r.events.map((e) => d(e.revenue.tickets + e.revenue.hospitality)), color: 'var(--chart-2)' }, { name: 'Public funding', values: r.events.map((e) => d(e.revenue.hostCityContribution + e.revenue.grantsEligible)), color: 'var(--chart-3)' }, { name: 'Other', values: r.events.map((e) => d(e.revenue.fnbShare + e.revenue.merchandise + e.revenue.vendorFees + e.revenue.media + e.revenue.digital + e.revenue.other)), color: 'var(--chart-4)' }]} />
          <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
            {r.events.map((e) => (
              <Pill key={e.eventId + e.year}>
                {e.gender === 'women' ? 'W' : 'M'} {e.year}: {Math.round(e.tickets.paidAdmissions).toLocaleString()} paid admissions
              </Pill>
            ))}
          </div>
        </Card>
      </Grid>
    </Page>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-0.5 text-[20px] font-semibold tabular-nums">{v}</div>
    </div>
  );
}
