import type { ObjectiveId } from '../engines/optimization/optimize';

export const DEFAULT_WEIGHTS: Record<ObjectiveId, number> = { minTax: 3, investorReturn: 3, canadianRetained: 2, txgReturn: 2, flexibility: 1, lowFinancingRisk: 2, canadianControl: 3, community: 1 };

export const MISSING_DOCS = [
  'U.S. LLC operating agreement, member register and IRS classification evidence (CP575 EIN letter; any Form 8832)',
  'Operator articles, by-laws, share register and any shareholders’ agreement',
  'Executed FIBA hosting agreement(s) — men’s and women’s — and the current Pro-Circuit and Women’s Series Handbooks',
  'Venue term sheets, permits and insurance requirements',
  'Signed sponsorship agreements (or letters of intent)',
  'Intercompany loan / management / licence agreements with transfer-pricing support',
  'Foundation by-laws, board minutes approving related-party agreements, and any grant agreements',
  'Private-equity term sheet and securities-law analysis of the raise (including any success fees)',
  'Host-city funding agreements and eligibility confirmations',
];

