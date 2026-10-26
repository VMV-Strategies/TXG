// Versioned tax-rule registry. Every rule carries its statutory authority, the
// years for which it was verified against a source, its confidence, and its
// review status. The engine never uses a single fixed percentage for every
// scenario: it asks this registry for the value applicable to a given year and
// receives a "verified" flag that drives the knowledge-freshness warnings.

export type Confidence = 'high' | 'medium' | 'low';
export type ReviewStatus = 'verified-against-source' | 'verified-secondary' | 'assumption' | 'unsupported';

export interface TaxRule {
  id: string;
  jurisdiction: 'CA-federal' | 'CA-ON' | 'US-federal' | 'US-NY' | 'CA-US treaty';
  name: string;
  /** Provision ids (src/data/source-metadata/provisions.json) or external source ids. */
  authority: string[];
  effectiveFrom: string;
  effectiveTo?: string;
  /** Years for which the value has been verified as enacted law. */
  verifiedYears: number[];
  /** Value by year (rates as decimals, amounts in the rule's currency). */
  values: Record<number, number>;
  /** Value used for later years when no enacted value is known. */
  carryForwardPolicy: 'assume-unchanged' | 'zero' | 'unsupported';
  currency?: 'CAD' | 'USD';
  methodology: string;
  conditions: string[];
  exceptions: string[];
  evidence: string;
  confidence: Confidence;
  reviewStatus: ReviewStatus;
  reviewedOn: string;
}

const REVIEWED = '2026-10-25';
const Y = (v: number, years = [2026]) => Object.fromEntries(years.map((y) => [y, v])) as Record<number, number>;

export const TAX_RULES: TaxRule[] = [
  {
    id: 'ca-fed-basic-rate',
    jurisdiction: 'CA-federal',
    name: 'Federal basic corporate rate',
    authority: ['ita-123-1'],
    effectiveFrom: '1988-01-01',
    verifiedYears: [2026],
    values: Y(0.38),
    carryForwardPolicy: 'assume-unchanged',
    methodology: '38% of taxable income (s. 123(1)(a)).',
    conditions: ['Corporation subject to Part I tax.'],
    exceptions: [],
    evidence: 'Income Tax Act consolidated text supplied with the project (current to 2026 amendments).',
    confidence: 'high',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'ca-fed-abatement',
    jurisdiction: 'CA-federal',
    name: 'Provincial abatement',
    authority: ['ita-124-1'],
    effectiveFrom: '1977-01-01',
    verifiedYears: [2026],
    values: Y(0.1),
    carryForwardPolicy: 'assume-unchanged',
    methodology: '10% of taxable income earned in a province (s. 124(1)). Model assumes all taxable income is earned in Ontario.',
    conditions: ['Income earned in a province through a permanent establishment there (Reg. 400-402).'],
    exceptions: ['Income not earned in a province is not abated.'],
    evidence: 'Income Tax Act s. 124(1).',
    confidence: 'high',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'ca-fed-grr',
    jurisdiction: 'CA-federal',
    name: 'General rate reduction',
    authority: ['ita-123.4'],
    effectiveFrom: '2012-01-01',
    verifiedYears: [2026],
    values: Y(0.13),
    carryForwardPolicy: 'assume-unchanged',
    methodology: '13% of "full rate taxable income" — taxable income less income eligible for the small business deduction (s. 123.4(2)). Net federal general rate 15%.',
    conditions: [],
    exceptions: ['Not available on income that benefits from the small business deduction or certain other preferential rates.'],
    evidence: 'Income Tax Act s. 123.4.',
    confidence: 'high',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'ca-fed-sbd-rate',
    jurisdiction: 'CA-federal',
    name: 'Small business deduction rate',
    authority: ['ita-125-1'],
    effectiveFrom: '2019-01-01',
    verifiedYears: [2026],
    values: Y(0.19),
    carryForwardPolicy: 'assume-unchanged',
    methodology: '19% × least of active business income in Canada, taxable income (adjusted) and the business limit (s. 125(1), (1.1)(c)). Net federal small-business rate 9%.',
    conditions: ['Corporation must be a CCPC throughout the taxation year.', 'Income must be from an active business carried on in Canada.'],
    exceptions: ['Specified partnership/corporate income rules (s. 125(1)(a)) may limit eligible income.'],
    evidence: 'Income Tax Act s. 125(1)-(1.1).',
    confidence: 'high',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'ca-business-limit',
    jurisdiction: 'CA-federal',
    name: 'Business limit',
    authority: ['ita-125-2'],
    effectiveFrom: '2009-01-01',
    verifiedYears: [2026],
    values: Y(500000),
    currency: 'CAD',
    carryForwardPolicy: 'assume-unchanged',
    methodology: '$500,000 per year, prorated for short years, shared among associated CCPCs (s. 125(2)-(4)), reduced for taxable capital above $10M (fully eliminated at $50M) and for adjusted aggregate investment income above $50,000 ($5 for each $1, eliminated at $150,000) (s. 125(5.1)).',
    conditions: ['Associated corporations must allocate one limit.'],
    exceptions: [],
    evidence: 'Income Tax Act s. 125(2)-(5.1).',
    confidence: 'high',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'on-general-rate',
    jurisdiction: 'CA-ON',
    name: 'Ontario general corporate rate',
    authority: ['ext-ontario-cit'],
    effectiveFrom: '2011-07-01',
    verifiedYears: [2026],
    values: Y(0.115),
    carryForwardPolicy: 'assume-unchanged',
    methodology: '11.5% of Ontario taxable income.',
    conditions: ['Income allocated to Ontario (Reg. 402).'],
    exceptions: ['Manufacturing and processing credit reduces the rate to 10% for qualifying income (not modelled).'],
    evidence: 'Ontario Ministry of Finance, “Corporate income tax” (ontario.ca), reviewed 2026-10-25. Ontario Taxation Act, 2007 is not in the uploaded library.',
    confidence: 'high',
    reviewStatus: 'verified-secondary',
    reviewedOn: REVIEWED,
  },
  {
    id: 'on-small-rate',
    jurisdiction: 'CA-ON',
    name: 'Ontario lower (small business) rate',
    authority: ['ext-ontario-cit', 'ext-ontario-budget-2026'],
    effectiveFrom: '2026-07-01',
    verifiedYears: [2026],
    // 3.2% to June 30, 2026; 2.2% from July 1, 2026. 2026 value is the day-weighted average for a calendar year.
    values: { 2026: (0.032 * 181 + 0.022 * 184) / 365 },
    carryForwardPolicy: 'assume-unchanged',
    methodology: 'Lower rate on income eligible for the Ontario small business deduction: 3.2% until June 30, 2026 and 2.2% from July 1, 2026 (prorated for straddling years). Forecast years use 2.2%.',
    conditions: ['CCPC throughout the year; Ontario business limit applies.'],
    exceptions: [
      'Ontario does not use the federal passive-income grind to reduce its business limit (modelled; confidence medium — confirm with the Taxation Act, 2007).',
    ],
    evidence: 'Ontario Ministry of Finance “Corporate income tax” page and 2026 Ontario Budget annex, reviewed 2026-10-25.',
    confidence: 'medium',
    reviewStatus: 'verified-secondary',
    reviewedOn: REVIEWED,
  },
  {
    id: 'ca-part13-general',
    jurisdiction: 'CA-federal',
    name: 'Part XIII withholding — statutory rate',
    authority: ['ita-212-1', 'ita-212-4', 'ita-212-2', 'ita-215-1'],
    effectiveFrom: '1985-01-01',
    verifiedYears: [2026],
    values: Y(0.25),
    carryForwardPolicy: 'assume-unchanged',
    methodology: '25% of gross dividends, non-arm’s-length or participating interest, management/administration fees, rents and royalties paid or credited to non-residents; the payer withholds and remits (s. 215).',
    conditions: ['Payment by a Canadian resident to a non-resident.'],
    exceptions: [
      'Arm’s-length interest that is not participating debt interest is not subject to Part XIII (s. 212(1)(b)).',
      'Management fees are carved out where the service is performed in the ordinary course of the non-resident’s own fee-for-service business and the parties deal at arm’s length, or the amount reimburses a specific expense — in each case to the extent reasonable (s. 212(4)).',
      'Treaty rates reduce the tax when the beneficial owner is entitled to treaty benefits.',
    ],
    evidence: 'Income Tax Act ss. 212, 214, 215.',
    confidence: 'high',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'tr-div-5',
    jurisdiction: 'CA-US treaty',
    name: 'Treaty dividend rate — 10% voting company',
    authority: ['tr-x-2a-5p'],
    effectiveFrom: '2008-12-15',
    verifiedYears: [2026],
    values: Y(0.05),
    carryForwardPolicy: 'assume-unchanged',
    methodology: '5% where the beneficial owner is a company owning ≥10% of the voting stock, including look-through ownership via a fiscally transparent entity that is not resident in Canada (Art. X(2)(a) as amended by the Fifth Protocol).',
    conditions: ['Beneficial owner is a U.S. resident company entitled to benefits (Art. XXIX A).', 'Ownership of ≥10% of voting stock.'],
    exceptions: ['Fiscally transparent entity rules in Art. IV(6)-(7).'],
    evidence: 'Canada–United States Tax Convention Act, 1984, Schedule VI (Fifth Protocol) Art. 5.',
    confidence: 'high',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'tr-div-15',
    jurisdiction: 'CA-US treaty',
    name: 'Treaty dividend rate — other cases',
    authority: ['tr-x'],
    effectiveFrom: '1985-08-16',
    verifiedYears: [2026],
    values: Y(0.15),
    carryForwardPolicy: 'assume-unchanged',
    methodology: '15% of gross dividends in all other cases (Art. X(2)(b)).',
    conditions: ['Beneficial owner is a U.S. resident entitled to benefits.'],
    exceptions: [],
    evidence: 'Convention Art. X(2)(b).',
    confidence: 'high',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'tr-int-0',
    jurisdiction: 'CA-US treaty',
    name: 'Treaty interest — residence-only taxation',
    authority: ['tr-xi-5p', 'tr-5p-27'],
    effectiveFrom: '2010-01-01',
    verifiedYears: [2026],
    values: Y(0),
    carryForwardPolicy: 'assume-unchanged',
    methodology: 'Interest beneficially owned by a U.S. resident may be taxed only in the U.S. (Art. XI(1)); participating interest may be taxed in Canada up to 15% (Art. XI(6)(b)). Related-party interest phase-in ended in 2010.',
    conditions: ['Beneficial owner entitled to treaty benefits; no Canadian PE to which the debt is connected (Art. XI(3)).'],
    exceptions: ['Excess (non-arm’s-length) interest beyond an arm’s-length amount is outside Art. XI (Art. XI(5)).', 'Thin-cap excess is deemed a dividend (s. 214(16)) and taxed under Art. X.'],
    evidence: 'Fifth Protocol Art. 6 and entry-into-force provisions.',
    confidence: 'high',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'tr-roy-10',
    jurisdiction: 'CA-US treaty',
    name: 'Treaty royalties',
    authority: ['tr-xii', 'tr-xii-3-1995'],
    effectiveFrom: '1996-01-01',
    verifiedYears: [2026],
    values: Y(0.1),
    carryForwardPolicy: 'assume-unchanged',
    methodology: '10% of gross royalties (Art. XII(2)); 0% for cultural copyright, computer software, patents/know-how information (Art. XII(3) as replaced by the 1995 Protocol). Trademark licences remain at 10%.',
    conditions: ['Beneficial owner entitled to treaty benefits.'],
    exceptions: ['Motion picture / television royalties are not exempt.'],
    evidence: 'Convention Art. XII; 1995 Protocol Art. V.',
    confidence: 'high',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'ca-reg105',
    jurisdiction: 'CA-federal',
    name: 'Regulation 105 withholding on services rendered in Canada',
    authority: ['itr-105'],
    effectiveFrom: '1985-01-01',
    verifiedYears: [2026],
    values: Y(0.15),
    carryForwardPolicy: 'assume-unchanged',
    methodology: '15% of fees for services rendered in Canada by a non-resident (other than employment). It is a payment on account of Part I tax and can be recovered by filing, or reduced by an approved treaty-based waiver.',
    conditions: ['Services physically performed in Canada.'],
    exceptions: ['Waivers where treaty protection (no PE) is demonstrated.'],
    evidence: 'Income Tax Regulations s. 105.',
    confidence: 'high',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'ca-thin-cap',
    jurisdiction: 'CA-federal',
    name: 'Thin capitalization ratio',
    authority: ['ita-18-4', 'ita-18-5-defs', 'ita-214-16'],
    effectiveFrom: '2013-01-01',
    verifiedYears: [2026],
    values: Y(1.5),
    carryForwardPolicy: 'assume-unchanged',
    methodology: 'Interest on debts owing to specified non-residents is non-deductible to the extent average debt exceeds 1.5 × equity amount (retained earnings at start of year + contributed surplus and paid-up capital attributable to specified non-resident shareholders). Disallowed interest is deemed a dividend for Part XIII.',
    conditions: ['Lender is a specified non-resident shareholder (≥25% of votes or value, alone or with non-arm’s-length persons) or does not deal at arm’s length with one.'],
    exceptions: [],
    evidence: 'Income Tax Act ss. 18(4)-(5), 214(16).',
    confidence: 'high',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'ca-eifel',
    jurisdiction: 'CA-federal',
    name: 'Excessive interest and financing expenses limitation (EIFEL)',
    authority: ['ita-18.2-excluded', 'ita-18.2-2'],
    effectiveFrom: '2023-10-01',
    verifiedYears: [2026],
    values: Y(0.3),
    carryForwardPolicy: 'assume-unchanged',
    methodology: 'Net interest and financing expenses limited to 30% of adjusted taxable income unless the taxpayer is an "excluded entity": (a) CCPC whose associated group taxable capital is under $50M; (b) group net interest and financing expenses of $1M or less; or (c) substantially all-Canadian groups meeting conditions. The engine approximates adjusted taxable income as EBITDA.',
    conditions: [],
    exceptions: ['Group ratio election, carryforwards and transfers of capacity are not modelled.'],
    evidence: 'Income Tax Act s. 18.2.',
    confidence: 'medium',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'ca-loss-carryforward',
    jurisdiction: 'CA-federal',
    name: 'Non-capital loss carryforward',
    authority: ['ita-111-1'],
    effectiveFrom: '2006-01-01',
    verifiedYears: [2026],
    values: Y(20),
    carryForwardPolicy: 'assume-unchanged',
    methodology: 'Non-capital losses may be carried forward 20 years (and back 3).',
    conditions: ['Acquisition-of-control rules can restrict losses (s. 111(5)) — not modelled.'],
    exceptions: [],
    evidence: 'Income Tax Act s. 111(1)(a).',
    confidence: 'high',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'ca-hst-on',
    jurisdiction: 'CA-federal',
    name: 'HST rate in Ontario',
    authority: ['eta-165'],
    effectiveFrom: '2010-07-01',
    verifiedYears: [2026],
    values: Y(0.13),
    carryForwardPolicy: 'assume-unchanged',
    methodology: '5% federal component (s. 165(1)) plus 8% Ontario component (s. 165(2), Schedule VIII). Registrants recover HST on inputs through input tax credits.',
    conditions: ['Taxable supply made in Ontario.'],
    exceptions: ['Exempt supplies by public service bodies (Schedule V, Part VI) — relevant to the Foundation.'],
    evidence: 'Excise Tax Act s. 165.',
    confidence: 'high',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'ca-cpp',
    jurisdiction: 'CA-federal',
    name: 'CPP employer contribution (2026)',
    authority: ['cpp-9', 'ext-cra-cpp-2026'],
    effectiveFrom: '2026-01-01',
    verifiedYears: [2026],
    values: Y(0.0595),
    carryForwardPolicy: 'assume-unchanged',
    methodology: '5.95% on earnings between the $3,500 basic exemption and the YMPE ($74,600 in 2026) plus 4% (CPP2) on earnings between YMPE and YAMPE ($85,000).',
    conditions: ['Pensionable employment.'],
    exceptions: [],
    evidence: 'CRA figures for 2026 as reported by Investment Executive (reviewed 2026-10-25). Annual thresholds are set administratively and will change in 2027+.',
    confidence: 'medium',
    reviewStatus: 'verified-secondary',
    reviewedOn: REVIEWED,
  },
  {
    id: 'ca-ei',
    jurisdiction: 'CA-federal',
    name: 'EI employer premium (2026)',
    authority: ['ei-66', 'ei-67-68', 'ext-esdc-ei-2026'],
    effectiveFrom: '2026-01-01',
    verifiedYears: [2026],
    values: Y(0.0228),
    carryForwardPolicy: 'assume-unchanged',
    methodology: 'Employee rate $1.63 per $100 of insurable earnings up to $68,900; employer pays 1.4× ($2.28 per $100).',
    conditions: ['Insurable employment outside Quebec.'],
    exceptions: [],
    evidence: 'Canada Employment Insurance Commission announcement for 2026 (canada.ca), reviewed 2026-10-25.',
    confidence: 'high',
    reviewStatus: 'verified-secondary',
    reviewedOn: REVIEWED,
  },
  {
    id: 'on-eht',
    jurisdiction: 'CA-ON',
    name: 'Ontario Employer Health Tax',
    authority: ['ext-ontario-eht'],
    effectiveFrom: '2020-01-01',
    verifiedYears: [2026],
    values: Y(0.0195),
    carryForwardPolicy: 'assume-unchanged',
    methodology: 'Graduated 0.98%–1.95% on total Ontario remuneration; eligible employers with group payroll under $5M exempt the first $1,000,000 (shared among associated employers).',
    conditions: [],
    exceptions: ['Registered charities have special exemption rules.'],
    evidence: 'Ontario Ministry of Finance EHT page (ontario.ca), reviewed 2026-10-25.',
    confidence: 'high',
    reviewStatus: 'verified-secondary',
    reviewedOn: REVIEWED,
  },
  {
    id: 'us-corp-rate',
    jurisdiction: 'US-federal',
    name: 'U.S. corporate income tax rate',
    authority: ['irc-11'],
    effectiveFrom: '2018-01-01',
    verifiedYears: [2026],
    values: Y(0.21),
    carryForwardPolicy: 'assume-unchanged',
    methodology: '21% of taxable income (26 U.S.C. § 11(b)). Applies only if the LLC is classified as a corporation.',
    conditions: ['Entity classified as an association taxable as a corporation (Treas. Reg. § 301.7701-3).'],
    exceptions: ['A disregarded or partnership LLC pays no entity-level federal income tax; members are taxed.'],
    evidence: 'U.S. Code Title 26, current through P.L. 119-102.',
    confidence: 'high',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'us-245a',
    jurisdiction: 'US-federal',
    name: 'Dividends received deduction (§ 245A)',
    authority: ['irc-245a'],
    effectiveFrom: '2018-01-01',
    verifiedYears: [2026],
    values: Y(1),
    carryForwardPolicy: 'assume-unchanged',
    methodology: '100% deduction for the foreign-source portion of dividends a domestic C corporation receives from a specified 10-percent owned foreign corporation; no foreign tax credit for taxes on those dividends (§ 245A(d)).',
    conditions: ['Recipient is a domestic corporation (not an S corporation, RIC or REIT) that is a U.S. shareholder.', 'One-year holding period (§ 246(c)).'],
    exceptions: ['Hybrid dividends are excluded (§ 245A(e)).'],
    evidence: '26 U.S.C. § 245A.',
    confidence: 'medium',
    reviewStatus: 'verified-against-source',
    reviewedOn: REVIEWED,
  },
  {
    id: 'ny-cft',
    jurisdiction: 'US-NY',
    name: 'New York corporation franchise tax (Article 9-A) business income rate',
    authority: ['ext-ny-budget-2026'],
    effectiveFrom: '2021-01-01',
    verifiedYears: [2026, 2027, 2028, 2029],
    values: { 2026: 0.0725, 2027: 0.0725, 2028: 0.0725, 2029: 0.0725 },
    carryForwardPolicy: 'unsupported',
    methodology: '6.5% of apportioned business income base; 7.25% where the business income base exceeds $5 million, extended through tax years beginning before January 1, 2030 by the enacted 2026-27 budget. The engine applies 6.5% when the base is ≤ $5M.',
    conditions: ['LLC classified as a corporation and doing business in New York.'],
    exceptions: ['Capital base and fixed dollar minimum not modelled; MTA surcharge (MCTD) not modelled — confirm the LLC’s business location.'],
    evidence: 'Hodgson Russ alert on the enacted 2026-27 New York budget; Business Council of NYS memo (reviewed 2026-10-25). NY Tax Law is not in the uploaded library.',
    confidence: 'medium',
    reviewStatus: 'verified-secondary',
    reviewedOn: REVIEWED,
  },
];

export interface RuleValue {
  value: number;
  rule: TaxRule;
  verified: boolean;
  note?: string;
}

export function getRule(id: string): TaxRule {
  const r = TAX_RULES.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown tax rule ${id}`);
  return r;
}

/** Returns the value for a year, falling back according to the rule's policy. */
export function ruleValue(id: string, year: number): RuleValue {
  const rule = getRule(id);
  if (rule.values[year] !== undefined) {
    return { value: rule.values[year], rule, verified: rule.verifiedYears.includes(year) };
  }
  const known = Object.keys(rule.values).map(Number).sort((a, b) => a - b);
  const prior = known.filter((y) => y <= year).pop();
  if (id === 'on-small-rate' && year > 2026) {
    return { value: 0.022, rule, verified: false, note: 'Forecast year: assumes the 2.2% rate enacted from July 1, 2026 continues unchanged.' };
  }
  if (rule.carryForwardPolicy === 'assume-unchanged' && prior !== undefined) {
    return {
      value: rule.values[prior],
      rule,
      verified: false,
      note: `Forecast year ${year}: assumes the ${prior} rule continues unchanged. Future legislation is not known.`,
    };
  }
  if (rule.carryForwardPolicy === 'unsupported') {
    const base = id === 'ny-cft' ? 0.065 : prior !== undefined ? rule.values[prior] : 0;
    return { value: base, rule, verified: false, note: `No enacted value for ${year}; using ${(base * 100).toFixed(2)}% as a conditional placeholder.` };
  }
  return { value: 0, rule, verified: false, note: 'No value available' };
}

/** External (non-library) sources consulted during development, recorded for the source register. */
export const EXTERNAL_SOURCES = [
  { id: 'ext-ontario-cit', label: 'Ontario Ministry of Finance — Corporate income tax', url: 'https://www.ontario.ca/document/corporations-tax/corporate-income-tax', reviewedOn: REVIEWED, kind: 'Official government guidance' },
  { id: 'ext-ontario-budget-2026', label: '2026 Ontario Budget — Annex: Details of Tax Measures', url: 'https://budget.ontario.ca/2026/annex.html', reviewedOn: REVIEWED, kind: 'Official government guidance' },
  { id: 'ext-ontario-eht', label: 'Ontario Ministry of Finance — Employer Health Tax', url: 'https://www.ontario.ca/document/employer-health-tax-eht', reviewedOn: REVIEWED, kind: 'Official government guidance' },
  { id: 'ext-cra-cpp-2026', label: 'CRA 2026 CPP maximum pensionable earnings (Investment Executive report)', url: 'https://www.investmentexecutive.com/industry-news/cra-announces-cpp-maximum-pensionable-earnings-for-2026/', reviewedOn: REVIEWED, kind: 'Professional commentary' },
  { id: 'ext-esdc-ei-2026', label: 'Canada Employment Insurance Commission sets the 2026 EI premium rate', url: 'https://www.canada.ca/en/employment-social-development/news/2025/09/canada-employment-insurance-commission-sets-the-2026-employment-insurance-premium-rate.html', reviewedOn: REVIEWED, kind: 'Official government guidance' },
  { id: 'ext-ny-budget-2026', label: 'Hodgson Russ — Tax provisions in the enacted 2026-27 New York budget', url: 'https://www.hodgsonruss.com/newsroom/alerts/tax-provisions-of-interest-in-the-enacted-2026-27-new-york-budget-bill', reviewedOn: REVIEWED, kind: 'Professional commentary' },
] as const;
