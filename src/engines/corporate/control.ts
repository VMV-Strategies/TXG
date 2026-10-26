// Canadian-controlled private corporation (CCPC) control analysis.
// This engine evaluates the information needed for the tests in ITA s. 125(7)
// ("Canadian-controlled private corporation"), s. 251(5)(b) (rights deemed exercised)
// and s. 256(5.1) (de facto control). It never concludes that 51% Canadian ownership
// alone guarantees CCPC status, and it reports uncertainty explicitly.
import type { EntityNode, Relationship, Scenario, SourceRef } from '../../types/domain';

export type TestResult = 'pass' | 'fail' | 'uncertain';

export interface HolderRow {
  holderId: string;
  name: string;
  residency: 'canadian' | 'non-resident' | 'unknown';
  publicCorp: boolean;
  shares: number;
  votes: number;
  optionVotes: number;
  pctVotes: number;
  pctVotesDeemed: number;
  pctShares: number;
  boardSeats: number;
  vetoRights: string[];
  usa: boolean;
  lender: boolean;
  economicDependence: boolean;
  /** Specified shareholder (≥25% of votes or value) — thin-cap relevance. */
  specifiedShareholder: boolean;
}

export interface ControlTest {
  id: string;
  label: string;
  result: TestResult;
  plain: string;
  expert: string;
  sources: SourceRef[];
}

export interface ControlAnalysis {
  targetId: string;
  holders: HolderRow[];
  tests: ControlTest[];
  status: 'likely-ccpc' | 'uncertain' | 'likely-not-ccpc';
  statusPlain: string;
  nonResidentVotesDeemed: number;
  /** Additional voting share (of the post-issue total) that could go to non-residents before reaching 50%. */
  headroomPct: number;
  headroomPlain: string;
  lossRisks: string[];
  missingEvidence: string[];
}

const S = (id: string, label: string, pinpoint?: string): SourceRef => ({ id, label, pinpoint });

function residencyOf(e: EntityNode | undefined): HolderRow['residency'] {
  if (!e) return 'unknown';
  if (e.tax.residence === 'CA') return 'canadian';
  if (e.tax.residence === 'US' || e.tax.residence === 'INTL') return 'non-resident';
  return 'unknown';
}

export function analyzeControl(scn: Scenario, targetId = scn.roles.operator): ControlAnalysis {
  const byId = new Map(scn.entities.map((e) => [e.id, e] as const));
  const intoTarget = scn.relationships.filter((r) => r.to === targetId);
  const shareRels = intoTarget.filter((r) => r.type === 'common-shares' || r.type === 'preferred-shares');
  const convRels = intoTarget.filter((r) => r.type === 'convertible');
  const loanRels = intoTarget.filter((r) => r.type === 'intercompany-loan' || r.type === 'third-party-loan');
  const holderIds = Array.from(new Set([...shareRels, ...convRels, ...intoTarget.filter((r) => r.rights)].map((r) => r.from)));

  const totalVotes = shareRels.reduce((a, r) => a + (r.equity?.shares ?? 0) * (r.equity?.votesPerShare ?? 0), 0);
  const totalShares = shareRels.reduce((a, r) => a + (r.equity?.shares ?? 0), 0);
  // Rights to acquire shares (convertibles, options) are deemed exercised (s. 251(5)(b)(i)).
  const optionVotesFor = (hid: string) => {
    let v = 0;
    for (const r of intoTarget.filter((x) => x.from === hid)) {
      if (r.type === 'convertible' && r.convertible) {
        const pct = r.convertible.conversionPct;
        // shares receivable so that holder owns pct of post-conversion shares
        const newShares = pct >= 1 ? 0 : (totalShares * pct) / (1 - pct);
        v += newShares * r.convertible.votesPerShare;
      }
      if (r.rights?.optionShares) v += r.rights.optionShares * (r.rights.optionVotesPerShare ?? 1);
    }
    return v;
  };
  const totalOptionVotes = holderIds.reduce((a, h) => a + optionVotesFor(h), 0);

  const holders: HolderRow[] = holderIds.map((hid) => {
    const e = byId.get(hid);
    const rels = shareRels.filter((r) => r.from === hid);
    const shares = rels.reduce((a, r) => a + (r.equity?.shares ?? 0), 0);
    const votes = rels.reduce((a, r) => a + (r.equity?.shares ?? 0) * (r.equity?.votesPerShare ?? 0), 0);
    const optionVotes = optionVotesFor(hid);
    const allRights = intoTarget.filter((r) => r.from === hid && r.rights).map((r) => r.rights!);
    const valueShare = totalShares ? shares / totalShares : 0;
    const voteShare = totalVotes ? votes / totalVotes : 0;
    return {
      holderId: hid,
      name: e?.name ?? hid,
      residency: residencyOf(e),
      publicCorp: !!e?.tax.listed,
      shares,
      votes,
      optionVotes,
      pctVotes: voteShare,
      pctVotesDeemed: totalVotes + totalOptionVotes ? (votes + optionVotes) / (totalVotes + optionVotes) : 0,
      pctShares: valueShare,
      boardSeats: allRights.reduce((a, r) => a + (r.boardSeats ?? 0), 0),
      vetoRights: allRights.flatMap((r) => r.vetoRights ?? []),
      usa: allRights.some((r) => r.usa),
      lender: loanRels.some((r) => r.from === hid),
      economicDependence: allRights.some((r) => r.economicDependence),
      specifiedShareholder: voteShare >= 0.25 || valueShare >= 0.25,
    };
  });

  const target = byId.get(targetId);
  const tests: ControlTest[] = [];
  const missing: string[] = [];
  const risks: string[] = [];

  // Test 1: private Canadian corporation
  const isCanadianCorp = target?.kind === 'ca-corp' && target.tax.residence === 'CA';
  tests.push({
    id: 'canadian-private',
    label: 'Private corporation that is a "Canadian corporation"',
    result: isCanadianCorp && !target?.tax.listed ? 'pass' : isCanadianCorp ? 'fail' : 'uncertain',
    plain: isCanadianCorp
      ? 'The company was incorporated in Canada and is resident here, and nothing indicates its shares trade on a stock exchange.'
      : 'The model does not show this company as a Canadian-incorporated, Canadian-resident private company.',
    expert: 'ITA s. 125(7) requires a "private corporation" (s. 89(1)) that is a "Canadian corporation" (s. 89(1)). Incorporation under the CBCA and Canadian residence are taken from the corporate record.',
    sources: [S('ita-125-7-ccpc', 'ITA s. 125(7) "Canadian-controlled private corporation"')],
  });

  // Holders with unknown residency
  for (const h of holders.filter((x) => x.residency === 'unknown')) missing.push(`Tax residence of shareholder "${h.name}"`);

  // Test 2: para (a) — controlled by non-residents/public corps (de jure, with rights deemed exercised)
  const nrDeemed = holders.filter((h) => h.residency !== 'canadian' || h.publicCorp);
  const nrVotesDeemed = nrDeemed.reduce((a, h) => a + h.votes + h.optionVotes, 0) / Math.max(1, totalVotes + totalOptionVotes);
  const nrVotesKnown = holders.filter((h) => h.residency === 'non-resident' || h.publicCorp).reduce((a, h) => a + h.votes + h.optionVotes, 0) / Math.max(1, totalVotes + totalOptionVotes);
  const paraA: TestResult = nrVotesKnown > 0.5 ? 'fail' : nrVotesDeemed > 0.5 ? 'uncertain' : nrVotesKnown === 0.5 ? 'uncertain' : 'pass';
  tests.push({
    id: 'para-a',
    label: 'Not controlled by non-residents or public corporations (votes, with rights deemed exercised)',
    result: paraA,
    plain:
      paraA === 'pass'
        ? `Non-Canadian holders would control about ${(nrVotesKnown * 100).toFixed(1)}% of the votes even if every option or conversion right were exercised — less than half.`
        : paraA === 'fail'
          ? `Non-Canadian holders would control about ${(nrVotesKnown * 100).toFixed(1)}% of the votes once rights to acquire shares are counted — more than half. That alone would end CCPC status.`
          : 'The answer depends on shareholders whose residence is not yet confirmed, or non-residents hold exactly half the votes.',
    expert:
      'Para. (a) of the CCPC definition; s. 251(5)(b) deems a person with a right to acquire shares or control votes to be in the same position as if the right were exercised. Votes are measured on a fully diluted basis for each holder.',
    sources: [S('ita-125-7-ccpc', 'ITA s. 125(7) para. (a)'), S('ita-251-5', 'ITA s. 251(5)(b)')],
  });

  // Test 3: para (b) — hypothetical single holder of all non-resident/public shares
  const paraB: TestResult = nrVotesDeemed > 0.5 ? 'fail' : nrVotesDeemed === 0.5 ? 'uncertain' : 'pass';
  tests.push({
    id: 'para-b',
    label: 'All non-resident/public shares combined would not control',
    result: paraB,
    plain:
      paraB === 'pass'
        ? 'Even if every non-Canadian and public-company shareholder were treated as one person, that person would not hold a majority of the votes.'
        : 'If all non-Canadian (or unconfirmed) shareholders were treated as one person, they would hold half or more of the votes. That test can deny CCPC status even when no single foreign holder has control.',
    expert: 'Para. (b) aggregates shares owned by non-residents, public corporations and para. (c) corporations as if owned by one particular person.',
    sources: [S('ita-125-7-ccpc', 'ITA s. 125(7) para. (b)')],
  });

  // Test 4: de facto control
  const deFactoIndicators: string[] = [];
  for (const h of holders.filter((x) => x.residency !== 'canadian')) {
    if (h.boardSeats && target) {
      const boardSize = intoTarget.find((r) => r.from === h.holderId && r.rights?.boardSize)?.rights?.boardSize;
      if (boardSize && h.boardSeats / boardSize > 0.5) deFactoIndicators.push(`${h.name} may appoint a majority of the board (${h.boardSeats} of ${boardSize}).`);
      else if (h.boardSeats) deFactoIndicators.push(`${h.name} may appoint ${h.boardSeats} director(s).`);
    }
    if (h.vetoRights.length) deFactoIndicators.push(`${h.name} holds veto rights: ${h.vetoRights.join(', ')}.`);
    if (h.usa) deFactoIndicators.push(`${h.name} is party to a unanimous shareholder agreement that may restrict the directors.`);
    if (h.lender) deFactoIndicators.push(`${h.name} is a lender; heavy reliance on its financing can be an influence factor.`);
    if (h.economicDependence) deFactoIndicators.push(`${h.name}: economic dependence indicated (e.g., sole funder, key licence).`);
  }
  // Fee/licence relationships from non-residents
  for (const r of scn.relationships.filter((r) => (r.type === 'license' || r.type === 'management-agreement' || r.type === 'revenue-share' || r.type === 'jv') && (r.to === targetId || r.from === targetId))) {
    const other = byId.get(r.to === targetId ? r.from : r.to);
    if (other && residencyOf(other) !== 'canadian') deFactoIndicators.push(`${other.name} has a ${r.type.replace('-', ' ')} relationship with the operator; arm’s-length commercial agreements are excluded from de facto control only where their main purpose is to govern how the business is conducted.`);
  }
  const strong = deFactoIndicators.some((d) => d.includes('majority of the board') || d.includes('unanimous shareholder agreement'));
  const deFacto: TestResult = strong ? 'fail' : deFactoIndicators.length ? 'uncertain' : 'pass';
  tests.push({
    id: 'de-facto',
    label: 'No de facto control by non-residents',
    result: deFacto,
    plain:
      deFacto === 'pass'
        ? 'No board-appointment, veto, unanimous-shareholder-agreement or dependence factors in favour of non-residents are recorded. Real-world facts can still create control in fact.'
        : deFacto === 'fail'
          ? 'A non-resident appears able to direct the board or the business. Control in fact by a non-resident would end CCPC status even with a Canadian voting majority.'
          : 'Some factors could give a non-resident influence over the company. Courts weigh all the facts; this needs professional review.',
    expert: `ITA s. 256(5.1): any direct or indirect influence that, if exercised, would result in control in fact. Indicators: ${deFactoIndicators.join(' ') || 'none recorded'}`,
    sources: [S('ita-256-5.1', 'ITA s. 256(5.1)')],
  });
  if (deFactoIndicators.length) risks.push(...deFactoIndicators);

  // Test 5: listed (para (c))
  tests.push({
    id: 'para-c',
    label: 'No class of shares listed on a designated stock exchange',
    result: target?.tax.listed ? 'fail' : 'pass',
    plain: target?.tax.listed ? 'The company is shown as listed.' : 'No listing is recorded.',
    expert: 'Para. (c) of the CCPC definition.',
    sources: [S('ita-125-7-ccpc', 'ITA s. 125(7) para. (c)')],
  });

  if (!shareRels.length) missing.push('Share register / cap table for the operator (number and class of shares, votes per share)');
  missing.push('Shareholders’ agreement or unanimous shareholder agreement (if any)');
  missing.push('Articles of incorporation and share conditions for the operator');
  if (holders.some((h) => h.residency === 'non-resident')) missing.push('Ownership chain of each non-resident holder (who ultimately controls the LLC)');

  risks.push(
    'Issuing voting shares, options, warrants or convertible notes to non-residents that would take combined non-resident votes above 50% (rights count as if exercised).',
    'Giving a non-resident the right to appoint a majority of directors or a veto over core decisions in a shareholders’ agreement.',
    'A unanimous shareholder agreement that moves directors’ powers to a non-resident shareholder.',
    'A Canadian controlling shareholder ceasing to be resident in Canada, or transferring shares to a non-resident or public corporation.',
    'Economic dependence on a non-resident funder or licensor combined with other influence factors (de facto control).',
    'Becoming listed on a designated stock exchange.',
  );

  const results = tests.map((t) => t.result);
  const status: ControlAnalysis['status'] = results.includes('fail') ? 'likely-not-ccpc' : results.includes('uncertain') || missing.length > 3 ? 'uncertain' : 'likely-ccpc';
  const statusPlain =
    status === 'likely-ccpc'
      ? 'On the facts entered, the company appears to meet the CCPC tests. This is not a guarantee: the share terms, any shareholder agreement and real-world influence must be confirmed.'
      : status === 'likely-not-ccpc'
        ? 'On the facts entered, at least one CCPC test appears to fail. The small business deduction and other CCPC benefits should not be assumed.'
        : 'CCPC status is uncertain on the facts entered. The model will not assume CCPC benefits unless you choose to.';

  // Headroom: how many votes non-residents could hold before para (b) fails (keep combined NR deemed votes below 50%).
  const nrVotesAbs = nrDeemed.reduce((a, h) => a + h.votes + h.optionVotes, 0);
  const caVotesAbs = totalVotes + totalOptionVotes - nrVotesAbs;
  // New NR votes x such that (nr + x)/(total + x) < 0.5  => x < caVotes - nrVotes
  const headroomVotes = Math.max(0, caVotesAbs - nrVotesAbs);
  const headroomPct = headroomVotes > 0 ? headroomVotes / (totalVotes + totalOptionVotes + headroomVotes) : 0;
  const headroomPlain =
    headroomVotes > 0
      ? `Measured by votes only, non-residents could receive new voting rights equal to just under ${(headroomPct * 100).toFixed(1)}% of the post-issue total before their combined votes reach half. Staying well below that line is prudent because rights to acquire shares, board rights and other influence also count.`
      : 'There is no voting headroom: non-resident (or unconfirmed) holders already hold half or more of the votes on a fully diluted basis.';

  return {
    targetId,
    holders,
    tests,
    status,
    statusPlain,
    nonResidentVotesDeemed: nrVotesDeemed,
    headroomPct,
    headroomPlain,
    lossRisks: risks,
    missingEvidence: missing,
  };
}

/** Thin-cap: is the lender a specified non-resident shareholder (or non-arm's-length with one)? */
export function isSpecifiedNonResidentShareholder(ctrl: ControlAnalysis, lenderId: string, scn: Scenario): boolean {
  const h = ctrl.holders.find((x) => x.holderId === lenderId);
  const lender = scn.entities.find((e) => e.id === lenderId);
  if (!lender || lender.tax.residence === 'CA') return false;
  if (h?.specifiedShareholder) return true;
  // Non-arm's-length with a specified non-resident shareholder
  return lender.tax.armsLengthWithOperator === 'no' && ctrl.holders.some((x) => x.residency === 'non-resident' && x.specifiedShareholder);
}

export type { Relationship };
