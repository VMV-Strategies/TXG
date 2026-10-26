import { useState } from 'react';
import type { CompetitionFormat, EventLineItems, EventModel, Gender, TicketingInputs } from '../../types/domain';
import { Button, Callout, Card, Grid, NumberField, Page, Pill, Segmented, SelectField, StatusBadge, TextField, Term } from '../../components/ui';
import { BarChart } from '../../components/charts';
import { useActive } from '../../hooks/useResult';
import { toast, updateScenario, useStore } from '../../state/store';
import { money, pct, toDisplay } from '../../utils/format';
import { COST_LABELS, REVENUE_LABELS, emptyLines } from '../../engines/events/events';
import { sum } from '../../engines/finance/finance';
import { EXTENDED_YEARS } from '../../data/synthetic/defaultScenario';

const REV_FIELDS: (keyof EventLineItems)[] = ['hospitality', 'fnbShare', 'merchandise', 'vendorFees', 'media', 'digital', 'hostCityContribution', 'grantsEligible', 'other'];
const COST_FIELDS: (keyof EventLineItems)[] = ['fibaHostingFee', 'venue', 'production', 'courtsEquipment', 'officials', 'athleteTravelAccommodation', 'marketing', 'insurance', 'medicalSecurity', 'staffingContractors', 'staffingEmployees', 'transportation', 'dataAccreditation', 'antiDopingIntegrity', 'otherCosts', 'nonResidentAthletePayments'];

export function EventsPage() {
  const { scn, result: r } = useActive();
  const cur = useStore((s) => s.currency);
  const [evId, setEvId] = useState(scn.events[0]?.id ?? '');
  const [year, setYear] = useState(scn.years[0]);
  const ev = scn.events.find((e) => e.id === evId) ?? scn.events[0];
  const d = (n: number, y?: number) => toDisplay(n, cur, r, y);
  const setEv = (f: (e: EventModel) => void) =>
    updateScenario((s) => {
      f(s.events.find((x) => x.id === ev.id)!);
    });
  const res = r.events.find((x) => x.eventId === ev?.id && x.year === year);
  const addEvent = () => {
    const id = `ev-${Date.now().toString(36)}`;
    updateScenario((s) => {
      s.events.push({ id, name: 'New event', gender: 'women', format: 'Endorsed', city: 'Toronto', operatorId: s.roles.operator, days: 2, eventMonth: 7, years: [...s.years], lines: Object.fromEntries(s.years.map((y) => [y, emptyLines()])), ticketing: Object.fromEntries(s.years.map((y) => [y, { capacityPerSession: 1000, sessions: 2, sellThrough: 0.5, compsPct: 0.1, refundsPct: 0.02, commissionPct: 0.07, pricesIncludeHst: false, products: [{ id: 'ga', name: 'General admission', price: 25, mix: 1, admissionsPerProduct: 1 }] } as TicketingInputs])), hostingRights: 'not-started', evidence: 'assumption' });
    });
    setEvId(id);
    toast('Event added.');
  };
  const extend = () => {
    if (scn.years.includes(EXTENDED_YEARS[0])) return toast('Already extended to 2032.');
    updateScenario((s) => {
      const last = s.years[s.years.length - 1];
      s.years = [...s.years, ...EXTENDED_YEARS];
      s.fx.cadPerUsd = { ...s.fx.cadPerUsd, ...Object.fromEntries(EXTENDED_YEARS.map((y) => [y, s.fx.cadPerUsd[last] ?? 1.35])) };
      for (const e of s.events) {
        e.years = [...e.years, ...EXTENDED_YEARS];
        for (const y of EXTENDED_YEARS) {
          e.lines[y] = structuredClone(e.lines[last] ?? emptyLines());
          if (e.ticketing[last]) e.ticketing[y] = structuredClone(e.ticketing[last]);
        }
      }
      for (const en of s.entities) if (en.overhead) for (const y of EXTENDED_YEARS) en.overhead[y] = en.overhead[last] ?? 0;
      s.investor.exitYear = s.years[s.years.length - 1];
    });
    toast('Extended to 2030–2032 by copying 2029 values (assumption). Exit year moved to 2032.');
  };
  if (!ev)
    return (
      <Page title="Event Financials">
        <Button onClick={addEvent}>Add an event</Button>
      </Page>
    );
  const L = ev.lines[year] ?? emptyLines();
  const T = ev.ticketing[year];
  const setL = (k: keyof EventLineItems, v: number) => setEv((e) => void ((e.lines[year] ??= emptyLines()), ((e.lines[year][k] as number) = v)));
  const setT = (f: (t: TicketingInputs) => void) => setEv((e) => void f(e.ticketing[year]));
  const men = r.events.filter((e) => e.gender === 'men');
  const women = r.events.filter((e) => e.gender === 'women');
  return (
    <Page
      title="Event Financials"
      subtitle="Each men’s and women’s event has its own revenue, costs, risks and cash flow (Level 1). Values are in CAD before HST."
      actions={
        <>
          <Button icon="plus" onClick={addEvent}>
            Add event
          </Button>
          <Button onClick={extend}>Extend to 2030–2032</Button>
        </>
      }
    >
      <Grid cols={2}>
        <Card title="Men’s and women’s events — individually and together" subtitle={`Revenue and EBITDA by year (${cur})`}>
          <BarChart ariaLabel="Event revenue and EBITDA" categories={r.years.map(String)} series={[{ name: 'Men’s revenue', values: r.years.map((y) => d(sum(men.filter((e) => e.year === y).map((e) => e.revenueTotal)), y)) }, { name: 'Women’s revenue', values: r.years.map((y) => d(sum(women.filter((e) => e.year === y).map((e) => e.revenueTotal)), y)), color: 'var(--chart-4)' }, { name: 'Combined EBITDA', values: r.years.map((y) => d(sum(r.events.filter((e) => e.year === y).map((e) => e.ebitda)), y)), color: 'var(--chart-5)' }]} />
        </Card>
        <Card title="Event P&L summary" pad={false}>
          <div className="overflow-x-auto px-2 pb-2">
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Year</th>
                  <th className="num">Revenue</th>
                  <th className="num">Costs</th>
                  <th className="num">EBITDA</th>
                  <th className="num">Margin</th>
                  <th className="num">Admissions</th>
                </tr>
              </thead>
              <tbody>
                {r.events.map((e) => (
                  <tr key={e.eventId + e.year} className="cursor-pointer" onClick={() => (setEvId(e.eventId), setYear(e.year))} style={e.eventId === ev.id && e.year === year ? { background: 'var(--accent-soft)' } : undefined}>
                    <td>
                      <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: e.gender === 'women' ? 'var(--chart-4)' : 'var(--chart-1)' }} />
                      {e.name}
                    </td>
                    <td>{e.year}</td>
                    <td className="num">{money(d(e.revenueTotal, e.year), cur, { compact: true })}</td>
                    <td className="num">{money(d(e.costTotal, e.year), cur, { compact: true })}</td>
                    <td className="num" style={{ color: e.ebitda < 0 ? 'var(--bad)' : 'var(--good)' }}>
                      {money(d(e.ebitda, e.year), cur, { compact: true })}
                    </td>
                    <td className="num">{pct(e.margin, 0)}</td>
                    <td className="num">{Math.round(e.tickets.paidAdmissions).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Grid>
      <Card
        title={ev.name}
        subtitle={
          <>
            {ev.gender === 'men' ? 'Men’s' : ev.gender === 'women' ? 'Women’s' : 'Mixed'} · {ev.format} · {ev.city} · hosting rights: <b>{ev.hostingRights.replace('-', ' ')}</b> <StatusBadge status={ev.evidence} />
          </>
        }
        actions={
          <>
            <SelectField label="Event" value={ev.id} onChange={setEvId} options={scn.events.map((e) => ({ value: e.id, label: e.name }))} />
            <Segmented label="Year" value={String(year)} onChange={(v) => setYear(Number(v))} options={ev.years.map((y) => ({ value: String(y), label: String(y) }))} />
          </>
        }
      >
        {ev.hostingRights !== 'executed' ? (
          <Callout tone="warn">FIBA hosting terms are not confirmed. Fees, rights and obligations here are assumptions — men’s and women’s terms are set separately and must not be assumed identical.</Callout>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <TextField label="Name" value={ev.name} onChange={(v) => setEv((e) => void (e.name = v))} />
          <SelectField<Gender> label="Competition" value={ev.gender} onChange={(v) => setEv((e) => void (e.gender = v))} options={[{ value: 'men', label: 'Men’s' }, { value: 'women', label: 'Women’s' }, { value: 'mixed', label: 'Mixed / combined' }]} />
          <SelectField<CompetitionFormat> label="Format" value={ev.format} onChange={(v) => setEv((e) => void (e.format = v))} options={[{ value: 'WT', label: 'World Tour (men)' }, { value: 'WS', label: 'Women’s Series' }, { value: 'Challenger', label: 'Challenger (men)' }, { value: 'Endorsed', label: 'FIBA-endorsed event' }, { value: 'Grassroots', label: 'Grassroots / community' }, { value: 'Combined-WT-WS', label: 'Combined WT + WS' }]} />
          <SelectField label="Hosting rights" value={ev.hostingRights} onChange={(v) => setEv((e) => void (e.hostingRights = v))} options={[{ value: 'not-started', label: 'Not started' }, { value: 'in-discussion', label: 'In discussion' }, { value: 'term-sheet', label: 'Term sheet' }, { value: 'executed', label: 'Executed agreement' }]} />
          <NumberField label="Event month (1–12)" value={ev.eventMonth} min={1} max={12} onChange={(v) => setEv((e) => void (e.eventMonth = Math.round(v)))} />
          <NumberField label="Event days" value={ev.days} onChange={(v) => setEv((e) => void (e.days = Math.round(v)))} />
          <NumberField label="Employees (headcount)" value={ev.employeeHeadcount ?? 0} onChange={(v) => setEv((e) => void (e.employeeHeadcount = Math.round(v)))} hint="Used for employer CPP/EI" />
          <SelectField label="Operator (contracting entity)" value={ev.operatorId} onChange={(v) => setEv((e) => void (e.operatorId = v))} options={scn.entities.filter((e) => e.kind === 'ca-corp' || e.kind === 'ca-nfp' || e.kind === 'us-llc').map((e) => ({ value: e.id, label: e.name }))} />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="h3 mb-2">Revenue — {year}</h3>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Sponsorship (if no pipeline deals)" value={L.sponsorshipOverride ?? 0} onChange={(v) => setL('sponsorshipOverride', v)} hint={scn.sponsors.some((s) => s.eventId === ev.id) ? 'Pipeline deals are used instead (Revenue & Sponsorship).' : undefined} />
              {REV_FIELDS.map((k) => (
                <NumberField key={k} label={REVENUE_LABELS[k] ?? k} value={L[k] as number} onChange={(v) => setL(k, v)} testId={`rev-${k}`} />
              ))}
            </div>
          </div>
          <div>
            <h3 className="h3 mb-2">Costs — {year}</h3>
            <div className="grid grid-cols-2 gap-3">
              {COST_FIELDS.map((k) => (
                <NumberField key={k} label={k === 'nonResidentAthletePayments' ? 'Host payments to non-resident athletes' : (COST_LABELS[k] ?? k)} value={L[k] as number} onChange={(v) => setL(k, v)} testId={`cost-${k}`} hint={k === 'fibaHostingFee' ? 'Assumption until the hosting agreement is executed.' : k === 'nonResidentAthletePayments' ? 'FIBA pays prize money itself; enter only amounts the host pays.' : undefined} />
              ))}
              <NumberField label="Contingency" percent value={L.contingencyPct} onChange={(v) => setL('contingencyPct', v)} />
            </div>
          </div>
        </div>
        {T ? (
          <div className="mt-6">
            <h3 className="h3 mb-2">Ticketing — {year}</h3>
            <div className="grid gap-3 md:grid-cols-6">
              <NumberField label="Capacity / session" value={T.capacityPerSession} onChange={(v) => setT((t) => void (t.capacityPerSession = v))} />
              <NumberField label="Sessions" value={T.sessions} onChange={(v) => setT((t) => void (t.sessions = v))} />
              <NumberField label="Paid sell-through" percent value={T.sellThrough} onChange={(v) => setT((t) => void (t.sellThrough = v))} testId="sellthrough" />
              <NumberField label="Complimentary" percent value={T.compsPct} onChange={(v) => setT((t) => void (t.compsPct = v))} />
              <NumberField label="Refunds" percent value={T.refundsPct} onChange={(v) => setT((t) => void (t.refundsPct = v))} />
              <NumberField label="Ticketing commission" percent value={T.commissionPct} onChange={(v) => setT((t) => void (t.commissionPct = v))} />
            </div>
            <label className="mt-2 flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={T.pricesIncludeHst} onChange={(e: { target: HTMLInputElement }) => setT((t) => void (t.pricesIncludeHst = e.target.checked))} /> Prices include <Term t="HST" />
            </label>
            <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Price</th>
                  <th className="num">Mix</th>
                  <th className="num">Admissions per product</th>
                  <th className="num">Sold</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {T.products.map((p, i) => (
                  <tr key={p.id}>
                    <td>
                      <input className="input" value={p.name} onChange={(e: { target: HTMLInputElement }) => setT((t) => void (t.products[i].name = e.target.value))} aria-label="Product name" />
                    </td>
                    <td className="num">
                      <input className="input num w-24" inputMode="decimal" value={p.price} onChange={(e: { target: HTMLInputElement }) => setT((t) => void (t.products[i].price = Number(e.target.value) || 0))} aria-label="Price" />
                    </td>
                    <td className="num">
                      <input className="input num w-20" inputMode="decimal" value={Math.round(p.mix * 100)} onChange={(e: { target: HTMLInputElement }) => setT((t) => void (t.products[i].mix = (Number(e.target.value) || 0) / 100))} aria-label="Mix %" />
                    </td>
                    <td className="num">
                      <input className="input num w-16" inputMode="decimal" value={p.admissionsPerProduct} onChange={(e: { target: HTMLInputElement }) => setT((t) => void (t.products[i].admissionsPerProduct = Math.max(1, Number(e.target.value) || 1)))} aria-label="Admissions per product" />
                    </td>
                    <td className="num">{Math.round(res?.tickets.products[i]?.sold ?? 0).toLocaleString()}</td>
                    <td className="num">{money(d(res?.tickets.products[i]?.revenue ?? 0, year), cur, { compact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button icon="plus" onClick={() => setT((t) => void t.products.push({ id: `p${Date.now()}`, name: 'New product', price: 50, mix: 0.05, admissionsPerProduct: 1 }))}>
                Add product
              </Button>
              {Math.abs(sum(T.products.map((p) => p.mix)) - 1) > 0.001 ? <Pill tone="warn">Mix totals {pct(sum(T.products.map((p) => p.mix)), 0)} — should be 100%</Pill> : <Pill tone="good">Mix 100%</Pill>}
            </div>
          </div>
        ) : null}
      </Card>
      {res ? (
        <Grid cols={2}>
          <Card title={`Result — ${ev.name} ${year}`}>
            <table className="table">
              <tbody>
                {Object.entries(res.revenue)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <tr key={k}>
                      <td>{REVENUE_LABELS[k] ?? k}</td>
                      <td className="num">{money(d(v, year), cur)}</td>
                    </tr>
                  ))}
                <tr className="font-semibold">
                  <td>Total revenue</td>
                  <td className="num">{money(d(res.revenueTotal, year), cur)}</td>
                </tr>
                {Object.entries(res.costs)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <tr key={k}>
                      <td className="muted">{COST_LABELS[k] ?? k}</td>
                      <td className="num muted">−{money(d(v, year), cur)}</td>
                    </tr>
                  ))}
                <tr className="font-semibold">
                  <td>Event EBITDA</td>
                  <td className="num" style={{ color: res.ebitda < 0 ? 'var(--bad)' : 'var(--good)' }}>
                    {money(d(res.ebitda, year), cur)}
                  </td>
                </tr>
                <tr>
                  <td className="muted">HST collected (not revenue; estimated)</td>
                  <td className="num muted">{money(d(res.hstCollected, year), cur)}</td>
                </tr>
              </tbody>
            </table>
          </Card>
          <Card title="Break-even calculator" subtitle="Exact assumptions and formula">
            {res.ebitda >= 0 ? (
              <Callout tone="good">This event covers its own costs in {year} with {money(d(res.ebitda, year), cur)} to spare (before corporate overhead, interest and tax).</Callout>
            ) : (
              <Callout tone="warn" title={`Gap: ${money(d(res.breakEvenGap, year), cur)}`}>
                At your estimated costs and sponsorship commitments, you need an additional {money(d(res.breakEvenGap, year), cur)} of net ticket and sponsorship revenue to reach operating break-even for this event.
              </Callout>
            )}
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1.5 text-[14px]">
              <dt className="muted">Formula</dt>
              <dd className="text-right font-mono text-[12px]">gap = max(0, costs − revenue)</dd>
              <dt className="muted">Paid admissions</dt>
              <dd className="num">{Math.round(res.tickets.paidAdmissions).toLocaleString()}</dd>
              <dt className="muted">Average net revenue per admission</dt>
              <dd className="num">{money(d(res.tickets.averageNetPerAdmission, year), cur)}</dd>
              <dt className="muted">Average price needed to break even on tickets alone</dt>
              <dd className="num">{res.breakEvenTicketPrice === null ? 'n/a' : money(d(res.breakEvenTicketPrice, year), cur)}</dd>
              <dt className="muted">Sponsorship needed instead (if tickets unchanged)</dt>
              <dd className="num">{money(d(res.sponsorCash + res.breakEvenGap, year), cur)}</dd>
            </dl>
            <p className="muted mt-3 text-[12px]">All-in break-even for the operator (including overhead, interest and fees) is on the Overview.</p>
          </Card>
        </Grid>
      ) : null}
    </Page>
  );
}
