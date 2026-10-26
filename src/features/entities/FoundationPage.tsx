import { Callout, Card, Grid, NumberField, Page, Pill, SourceLinks, Term, Toggle } from '../../components/ui';
import { useActive } from '../../hooks/useResult';
import { updateScenario, useStore } from '../../state/store';
import { money, toDisplay } from '../../utils/format';

export function FoundationPage() {
  const { scn, result: r } = useActive();
  const cur = useStore((s) => s.currency);
  const n = r.nfp;
  const f = scn.entities.find((e) => e.id === scn.roles.foundation);
  const d = (x: number, y?: number) => toDisplay(x, cur, r, y);
  return (
    <Page title={f?.name ?? 'Foundation'} subtitle={<>A federally incorporated not-for-profit. It is <b>not</b> assumed to be a registered charity, to be able to issue donation receipts, or to be exempt from every tax. Its activities are kept separate from the commercial event operator.</>}>
      {!scn.foundation.governingDocsLoaded ? (
        <Callout tone="info" title="Governing documents not loaded">
          Import the private fact pack (Settings → Import fact pack) to load the Foundation’s actual purposes, directors and governance facts. Until then, examples refer to generic purposes.
        </Callout>
      ) : null}
      <Card title="How can a not-for-profit legitimately participate in a commercial sports event?">
        <div className="space-y-2 text-[15px] leading-relaxed">
          <p>The Foundation can take part when it runs its own programs for its own purposes, and any money that moves between it and the commercial operator pays fair value for something real. It can, for example, deliver youth clinics the operator’s sponsors want, receive grants restricted to girls’ basketball, or train volunteers — as long as the program serves the public and not the commercial event’s profit.</p>
          <p>
            It cannot pay its surplus to members as profit (<SourceLinks refs={[{ id: 'nfp-34', label: 'NFP Act s. 34' }]} />), cannot subsidise the operator’s costs, and cannot issue <Term t="Qualified donee">tax receipts</Term> unless it is registered with the CRA. Directors who also control the operator must disclose that interest (<SourceLinks refs={[{ id: 'nfp-141', label: 'NFP Act s. 141' }]} />). Keeping its income-tax exemption as a <Term t="Not-for-profit corporation">non-profit organization</Term> requires it to be organized and operated for non-profit purposes (<SourceLinks refs={[{ id: 'ita-149-1-l', label: 'ITA s. 149(1)(l)' }]} />).
          </p>
        </div>
      </Card>
      <Grid cols={2}>
        <Card title="Governance facts">
          <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-[14px]">
            <dt className="muted">Registered charity</dt>
            <dd>
              <Pill tone={f?.tax.registeredCharity === 'yes' ? 'good' : 'warn'}>{f?.tax.registeredCharity ?? 'unknown'}</Pill>
            </dd>
            <dt className="muted">Registered Canadian amateur athletic association</dt>
            <dd>
              <Pill tone={f?.tax.rcaaa === 'yes' ? 'good' : 'warn'}>{f?.tax.rcaaa ?? 'unknown'}</Pill>
            </dd>
            <dt className="muted">Directors recorded</dt>
            <dd>{scn.foundation.directorsCount ?? 'not loaded'}</dd>
            <dt className="muted">Membership limited to directors</dt>
            <dd>{scn.foundation.membershipRestrictedToDirectors === undefined ? 'not loaded' : scn.foundation.membershipRestrictedToDirectors ? 'Yes' : 'No'}</dd>
            <dt className="muted">Liquidation to qualified donees</dt>
            <dd>{scn.foundation.liquidationToQualifiedDonees === undefined ? 'not loaded' : scn.foundation.liquidationToQualifiedDonees ? 'Yes' : 'No'}</dd>
          </dl>
          <div className="mt-3">
            <Toggle label="A Foundation director also controls the commercial operator" checked={!!scn.foundation.directorOverlapWithOperator} onChange={(v) => updateScenario((s) => void (s.foundation.directorOverlapWithOperator = v))} />
          </div>
          {scn.foundation.purposes.length ? (
            <div className="mt-4">
              <div className="label mb-1">Purposes (from articles)</div>
              <ol className="list-decimal space-y-1 pl-5 text-[13px]">
                {scn.foundation.purposes.map((p) => (
                  <li key={p.no}>{p.title}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </Card>
        <Card title="Compliance checks">
          <ul className="space-y-3">
            {n.checks.map((c) => (
              <li key={c.id} className="text-[14px]">
                <div className="flex items-center gap-2 font-medium">
                  <Pill tone={c.status === 'ok' ? 'good' : c.status === 'risk' ? 'bad' : c.status === 'watch' ? 'warn' : 'neutral'}>{c.status}</Pill>
                  {c.label}
                </div>
                <p className="mt-1 leading-relaxed ink2">{c.plain}</p>
                <SourceLinks refs={c.sources} />
              </li>
            ))}
          </ul>
        </Card>
      </Grid>
      <Card title="Funding and activity model" subtitle={`Distinguishes commercial sponsorship, restricted grants, unrestricted funding, program revenue, service fees, donations and reimbursements (${cur}).`} pad={false}>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="table">
            <thead>
              <tr>
                <th>Year</th>
                <th className="num">Commercial sponsorship</th>
                <th className="num">Restricted grants</th>
                <th className="num">Unrestricted</th>
                <th className="num">Program revenue</th>
                <th className="num">Service fees (FMV)</th>
                <th className="num">Donations</th>
                <th className="num">Program costs</th>
                <th className="num">Overhead</th>
                <th className="num">Surplus</th>
              </tr>
            </thead>
            <tbody>
              {n.years.map((y) => (
                <tr key={y.year}>
                  <td>{y.year}</td>
                  <td className="num">{money(d(y.commercialSponsorship, y.year), cur, { compact: true })}</td>
                  <td className="num">{money(d(y.restrictedGrants, y.year), cur, { compact: true })}</td>
                  <td className="num">{money(d(y.unrestrictedFunding, y.year), cur, { compact: true })}</td>
                  <td className="num">{money(d(y.programRevenue, y.year), cur, { compact: true })}</td>
                  <td className="num">{money(d(y.serviceFees, y.year), cur, { compact: true })}</td>
                  <td className="num">{money(d(y.donations, y.year), cur, { compact: true })}</td>
                  <td className="num">{money(d(y.programCosts, y.year), cur, { compact: true })}</td>
                  <td className="num">{money(d(y.overhead, y.year), cur, { compact: true })}</td>
                  <td className="num font-semibold" style={{ color: y.surplus < 0 ? 'var(--bad)' : undefined }}>
                    {money(d(y.surplus, y.year), cur, { compact: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 px-5 pb-5 md:grid-cols-3">
          {scn.years.map((y) => (
            <NumberField key={y} label={`Program costs ${y} (CAD)`} value={scn.foundation.programCosts?.[y] ?? 0} onChange={(v) => updateScenario((s) => void (s.foundation.programCosts = { ...(s.foundation.programCosts ?? {}), [y]: v }))} />
          ))}
        </div>
        <p className="muted px-5 pb-4 text-[12px]">Grants and service agreements are edited on the Entity Map (connections to and from the Foundation).</p>
      </Card>
      <Card title="Examples supported by the governing documents" subtitle="Each with the legal limitation that keeps it legitimate">
        <div className="grid gap-4 md:grid-cols-2">
          {n.examples.map((e) => (
            <div key={e.activity} className="rounded-2xl p-4" style={{ background: 'var(--card-2)' }}>
              <div className="font-semibold">{e.activity}</div>
              <p className="mt-1 text-[14px] leading-relaxed">{e.how}</p>
              <p className="mt-2 text-[13px]" style={{ color: 'var(--warn)' }}>
                Limit: {e.limits}
              </p>
              <p className="muted mt-1 text-[12px]">{e.purposeNos.length ? `Supported by purpose clause(s) ${e.purposeNos.join(', ')} of the articles.` : 'Purpose mapping available after the fact pack is imported.'}</p>
            </div>
          ))}
        </div>
      </Card>
    </Page>
  );
}
