// Foundation — not-for-profit participation analysis.
// Never assumes registered-charity status, receipting ability, or blanket tax exemption.
import type { Issue, Scenario, SourceRef } from '../../types/domain';
import type { Flow } from '../scenarios/compute';

export interface NfpYear {
  year: number;
  commercialSponsorship: number;
  restrictedGrants: number;
  unrestrictedFunding: number;
  programRevenue: number;
  serviceFees: number;
  donations: number;
  reimbursements: number;
  totalInflows: number;
  programCosts: number;
  overhead: number;
  surplus: number;
  publicSourceFunding: number;
}

export interface NfpCheck {
  id: string;
  label: string;
  status: 'ok' | 'watch' | 'risk' | 'unknown';
  plain: string;
  sources: SourceRef[];
}

export interface NfpAnalysis {
  foundationId: string;
  years: NfpYear[];
  checks: NfpCheck[];
  examples: { activity: string; how: string; purposeNos: number[]; limits: string }[];
  issues: Issue[];
}

const S = (id: string, label: string): SourceRef => ({ id, label });

export function analyzeNfp(scn: Scenario, flows: Flow[], years: number[]): NfpAnalysis {
  const id = scn.roles.foundation;
  const f = scn.entities.find((e) => e.id === id);
  const issues: Issue[] = [];
  const rows: NfpYear[] = years.map((y) => {
    const inF = flows.filter((x) => x.year === y && x.to === id);
    const outF = flows.filter((x) => x.year === y && x.from === id);
    const rel = (fl: Flow) => scn.relationships.find((r) => r.id === fl.relId);
    const sumK = (fs: Flow[]) => fs.reduce((a, x) => a + x.gross, 0);
    const commercialSponsorship = sumK(inF.filter((x) => x.kind === 'sponsorship'));
    const restrictedGrants = sumK(inF.filter((x) => (x.kind === 'grant' && rel(x)?.grant?.restricted) || x.kind === 'restricted-funding'));
    const unrestrictedFunding = sumK(inF.filter((x) => x.kind === 'grant' && !rel(x)?.grant?.restricted));
    const serviceFees = sumK(inF.filter((x) => x.kind === 'service-fee'));
    const donations = sumK(inF.filter((x) => x.kind === 'donation'));
    const programRevenue = sumK(inF.filter((x) => x.kind === 'tickets' || x.kind === 'other-revenue'));
    const reimbursements = 0;
    const totalInflows = commercialSponsorship + restrictedGrants + unrestrictedFunding + serviceFees + donations + programRevenue + reimbursements;
    const overhead = sumK(outF.filter((x) => x.kind === 'overhead'));
    const programCosts = scn.foundation.programCosts?.[y] ?? 0;
    const publicSourceFunding = sumK(inF.filter((x) => {
      const src = scn.entities.find((e) => e.id === x.from);
      return src?.kind === 'government' || x.kind === 'donation' || src?.kind === 'sponsor';
    }));
    return { year: y, commercialSponsorship, restrictedGrants, unrestrictedFunding, programRevenue, serviceFees, donations, reimbursements, totalInflows, programCosts, overhead, surplus: totalInflows - overhead - programCosts, publicSourceFunding };
  });

  const checks: NfpCheck[] = [];
  const charity = f?.tax.registeredCharity ?? 'unknown';
  checks.push({
    id: 'receipts',
    label: 'Can the Foundation issue official donation receipts?',
    status: charity === 'yes' ? 'ok' : 'risk',
    plain:
      charity === 'yes'
        ? 'The Foundation is recorded as a registered charity. Receipts must still follow CRA rules.'
        : 'Not unless it becomes a registered charity (or registered Canadian amateur athletic association) — a not-for-profit corporation is not a qualified donee by being incorporated. Donors should not be told they will receive tax receipts.',
    sources: [S('ita-248-qd', 'ITA "qualified donee"'), S('ita-149.1-charorg', 'ITA s. 149.1(1) "charitable organization"'), S('ita-149.1-caaa', 'ITA s. 149.1(1) "Canadian amateur athletic association"')],
  });
  const totalSurplus = rows.reduce((a, r) => a + r.surplus, 0);
  const totalIn = rows.reduce((a, r) => a + r.totalInflows, 0);
  checks.push({
    id: 'npo-exemption',
    label: 'Income-tax exemption as a non-profit organization (s. 149(1)(l))',
    status: totalIn > 0 && totalSurplus / Math.max(1, totalIn) > 0.25 ? 'risk' : 'watch',
    plain:
      'A non-profit organization that is not a charity is exempt only if it is organized and operated exclusively for a non-profit purpose and no income is available to members. Large or persistent surpluses, or commercial activity run for profit, can put the exemption at risk. ' +
      (totalIn ? `Modelled surplus is ${Math.round((totalSurplus / Math.max(1, totalIn)) * 100)}% of inflows over the period.` : 'No Foundation inflows are modelled yet.'),
    sources: [S('ita-149-1-l', 'ITA s. 149(1)(l)'), S('nfp-34', 'NFP Act s. 34')],
  });
  const maxPublic = Math.max(0, ...rows.map((r) => r.publicSourceFunding));
  const soliciting = maxPublic > 10_000 || f?.tax.solicitingCorporation === 'yes';
  const directors = scn.foundation.directorsCount;
  checks.push({
    id: 'soliciting',
    label: 'Soliciting corporation status and board composition',
    status: soliciting ? (directors !== undefined && directors >= 3 ? 'watch' : 'risk') : 'ok',
    plain: soliciting
      ? `Public-source funding (government grants or donations requested from non-members) of up to ${Math.round(maxPublic).toLocaleString('en-CA')} in a year would likely make the Foundation a "soliciting corporation" (prescribed threshold — commonly $10,000 under the NFP Regulations, which are not in the library). It must then have at least three directors, two of whom are not officers or employees, and meets enhanced financial-disclosure duties.${directors !== undefined ? ` Recorded directors: ${directors}.` : ''}`
      : 'At the funding modelled, the Foundation does not appear to cross the soliciting-corporation threshold.',
    sources: [S('nfp-2-5.1', 'NFP Act s. 2(5.1)'), S('nfp-125', 'NFP Act s. 125')],
  });
  const related = flows.some((x) => (x.from === id && x.to === scn.roles.operator) || (x.to === id && x.from === scn.roles.operator));
  checks.push({
    id: 'related-party',
    label: 'Related-party transactions and conflicts of interest',
    status: related && scn.foundation.directorOverlapWithOperator ? 'risk' : related ? 'watch' : 'ok',
    plain: related
      ? `Money moves between the Foundation and the commercial operator.${scn.foundation.directorOverlapWithOperator ? ' At least one person is on the Foundation board and controls the operator. ' : ' '}Interested directors must disclose the interest and generally not vote; every transaction should be at fair market value, documented, and for the Foundation’s purposes — not to subsidise the commercial event.`
      : 'No flows between the Foundation and the operator are modelled.',
    sources: [S('nfp-141', 'NFP Act s. 141'), S('nfp-34', 'NFP Act s. 34')],
  });
  const restrictedUnverified = scn.relationships.some((r) => r.to === id && (r.type === 'grant' || r.type === 'restricted-funding') && !r.grant?.eligibilityVerified);
  checks.push({
    id: 'grant-restrictions',
    label: 'Grant eligibility and restrictions',
    status: restrictedUnverified ? 'watch' : 'ok',
    plain: restrictedUnverified ? 'One or more grants have not been verified for eligibility. Restricted funds must be spent only on the stated purpose and reported to the funder.' : 'No unverified grants are modelled.',
    sources: [],
  });
  checks.push({
    id: 'hst',
    label: 'GST/HST status',
    status: 'unknown',
    plain: 'As a non-profit, the Foundation may be a "public service body" whose supplies are often exempt, which limits input tax credits. A partial rebate may be available if it is a qualifying non-profit (government funding threshold). Confirm before pricing services.',
    sources: [S('eta-165', 'ETA s. 165')],
  });
  checks.push({
    id: 'no-distribution',
    label: 'No distribution of surplus to members or directors',
    status: 'ok',
    plain: 'The Foundation cannot pay profits to its members. Reasonable pay for services and documented expense reimbursements are permitted; dividends or profit shares are not.',
    sources: [S('nfp-34', 'NFP Act s. 34')],
  });

  for (const c of checks.filter((c) => c.status === 'risk')) {
    issues.push({ id: `nfp-${c.id}`, severity: 'warning', area: 'nfp', title: `Foundation: ${c.label}`, plain: c.plain, sources: c.sources, resolution: 'Review with not-for-profit counsel before launch.', professional: true });
  }

  const P = (title: string) => scn.foundation.purposes.find((p) => p.title.toLowerCase().includes(title))?.no;
  const nums = (...xs: (number | undefined)[]) => xs.filter((x): x is number => typeof x === 'number');
  const examples = [
    { activity: 'Free community 3x3 clinics and youth leagues around the event', how: 'The Foundation runs the program; the operator may donate court time or pay a fair-value fee for community-engagement services that its sponsors require.', purposeNos: nums(P('sport'), P('youth')), limits: 'Program must serve the public, not promote the commercial event; any fee must be at fair market value.' },
    { activity: 'Girls’ and women’s basketball development pathway', how: 'Restricted grants from sport or government funders flow to the Foundation and are spent on coaching, equipment and travel for participants.', purposeNos: nums(P('sport'), P('youth'), P('mentor')), limits: 'Spend restricted funds only as the grant agreement allows; report outcomes.' },
    { activity: 'Volunteer training and workforce placements at the event', how: 'The Foundation trains volunteers and job seekers; the operator reimburses documented direct costs or pays a services fee.', purposeNos: nums(P('education'), P('economic')), limits: 'Avoid the Foundation bearing the operator’s staffing costs (private benefit).' },
    { activity: 'Mentorship sessions with athletes and industry leaders', how: 'Delivered by the Foundation; athletes participate under the operator’s FIBA and team arrangements.', purposeNos: nums(P('mentor')), limits: 'Confirm image and appearance rights with FIBA/teams.' },
    { activity: 'Legacy court refurbishment in Toronto neighbourhoods', how: 'Funded by sponsors’ community commitments or municipal grants, owned or managed with community partners.', purposeNos: nums(P('community'), P('partnership')), limits: 'Sponsor recognition must not turn the gift into advertising for the operator; asset ownership documented.' },
  ];
  return { foundationId: id, years: rows, checks, examples, issues };
}
