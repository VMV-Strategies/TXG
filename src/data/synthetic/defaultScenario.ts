// Synthetic demonstration data. EVERYTHING here is hypothetical and labelled
// "synthetic". It contains no confidential corporate information: real facts
// (directors, addresses, numbers, shareholdings) are imported locally from the
// private fact pack and never committed to source control.
import type { EntityNode, EventLineItems, EventModel, Relationship, Scenario, SponsorDeal, TicketingInputs } from '../../types/domain';

export const YEARS = [2027, 2028, 2029];
export const EXTENDED_YEARS = [2030, 2031, 2032];
const now = () => new Date().toISOString();

const grow = (base: number, rate: number, years = YEARS) => Object.fromEntries(years.map((y, i) => [y, Math.round(base * Math.pow(1 + rate, i))]));

export function defaultEntities(): EntityNode[] {
  return [
    { id: 'pe', name: 'Private Equity Investor', kind: 'investor', jurisdiction: 'US', x: 40, y: 30, inGroup: false, currency: 'USD', evidence: 'synthetic', tax: { residence: 'US', lobQualifying: 'unknown' }, notes: 'Hypothetical U.S. private-equity fund. Identity and terms not yet known.' },
    {
      id: 'txg',
      name: 'Three X Global (U.S. LLC)',
      kind: 'us-llc',
      jurisdiction: 'US',
      x: 40,
      y: 200,
      inGroup: true,
      currency: 'USD',
      evidence: 'synthetic',
      overhead: grow(120000, 0.05), // share of global overhead allocated to the Toronto project (assumption)
      openingCash: 0,
      tax: { residence: 'US', usClassification: 'unknown', memberUsResidentShare: 1, memberCorporateShare: 0, memberMarginalRate: 0.408, lobQualifying: 'unknown', nyApportionment: 0.1, armsLengthWithOperator: 'unknown' },
      notes: 'New York LLC. U.S. tax classification and members must be confirmed from evidence (operating agreement, EIN letter, any Form 8832).',
    },
    {
      id: 'op',
      name: 'Canadian Operator Inc. (synthetic)',
      kind: 'ca-corp',
      jurisdiction: 'CA',
      x: 330,
      y: 200,
      inGroup: true,
      currency: 'CAD',
      evidence: 'synthetic',
      overhead: grow(300000, 0.06),
      openingCash: 0,
      tax: { residence: 'CA', associatedTaxableCapital: 2_500_000, aaii: 0, businessLimitShare: 1 },
      notes: 'Synthetic placeholder for the Canadian operating corporation (CBCA). Import the private fact pack to apply the actual corporate record.',
    },
    {
      id: 'fdn',
      name: 'Community Sport Foundation (synthetic)',
      kind: 'ca-nfp',
      jurisdiction: 'CA',
      x: 620,
      y: 200,
      inGroup: true,
      currency: 'CAD',
      evidence: 'synthetic',
      overhead: grow(60000, 0.05),
      openingCash: 0,
      tax: { residence: 'CA', registeredCharity: 'unknown', rcaaa: 'unknown', solicitingCorporation: 'unknown' },
      notes: 'Synthetic placeholder for a federal not-for-profit corporation (Canada Not-for-profit Corporations Act). Charity registration not assumed.',
    },
    { id: 'founder', name: 'Canadian founder (individual shareholder)', kind: 'individual', jurisdiction: 'CA', x: 330, y: 30, inGroup: false, currency: 'CAD', evidence: 'synthetic', tax: { residence: 'CA' }, notes: 'Synthetic placeholder: a Canadian-resident individual holding all voting shares of the operator. Exact share count comes from the share register.' },
    { id: 'fiba', name: 'FIBA', kind: 'fiba', jurisdiction: 'INTL', x: 620, y: 380, inGroup: false, currency: 'CAD', evidence: 'official-rule', tax: { residence: 'INTL' }, notes: 'International Basketball Federation (Switzerland). Owns Pro Circuit commercial rights (Book 6, art. 6-6).' },
    { id: 'sponsors', name: 'Sponsors', kind: 'sponsor', jurisdiction: 'CA', x: 40, y: 380, inGroup: false, currency: 'CAD', evidence: 'synthetic', tax: { residence: 'CA' } },
    { id: 'gov', name: 'Government Funding Sources', kind: 'government', jurisdiction: 'CA', x: 620, y: 30, inGroup: false, currency: 'CAD', evidence: 'synthetic', tax: { residence: 'CA' } },
    { id: 'venue', name: 'Venue', kind: 'venue', jurisdiction: 'CA', x: 330, y: 380, inGroup: false, currency: 'CAD', evidence: 'synthetic', tax: { residence: 'CA' } },
    { id: 'vendors', name: 'Event Vendors', kind: 'vendor', jurisdiction: 'CA', x: 620, y: 540, inGroup: false, currency: 'CAD', evidence: 'synthetic', tax: { residence: 'CA' } },
    { id: 'staff', name: 'Staff and Contractors', kind: 'staff', jurisdiction: 'CA', x: 330, y: 540, inGroup: false, currency: 'CAD', evidence: 'synthetic', tax: { residence: 'CA' } },
    { id: 'fans', name: 'Customers and Fans', kind: 'fans', jurisdiction: 'CA', x: 40, y: 540, inGroup: false, currency: 'CAD', evidence: 'synthetic', tax: { residence: 'CA' } },
  ];
}

function lines(o: Partial<EventLineItems>): EventLineItems {
  return {
    fnbShare: 0, merchandise: 0, vendorFees: 0, media: 0, digital: 0, hostCityContribution: 0, grantsEligible: 0, hospitality: 0, other: 0,
    fibaHostingFee: 0, venue: 0, production: 0, courtsEquipment: 0, officials: 0, athleteTravelAccommodation: 0, marketing: 0, insurance: 0,
    medicalSecurity: 0, staffingContractors: 0, staffingEmployees: 0, transportation: 0, dataAccreditation: 0, antiDopingIntegrity: 0, otherCosts: 0,
    contingencyPct: 0.05, nonResidentAthletePayments: 0, ...o,
  };
}

const REV_KEYS: (keyof EventLineItems)[] = ['fnbShare', 'merchandise', 'vendorFees', 'media', 'digital', 'hostCityContribution', 'grantsEligible', 'hospitality', 'other'];
const COST_KEYS: (keyof EventLineItems)[] = ['fibaHostingFee', 'venue', 'production', 'courtsEquipment', 'officials', 'athleteTravelAccommodation', 'marketing', 'insurance', 'medicalSecurity', 'staffingContractors', 'staffingEmployees', 'transportation', 'dataAccreditation', 'antiDopingIntegrity', 'otherCosts'];

function byYear(base: EventLineItems, revGrowth: number, costGrowth: number): Record<number, EventLineItems> {
  return Object.fromEntries(
    YEARS.map((y, i) => {
      const l = { ...base };
      for (const k of REV_KEYS) (l[k] as number) = Math.round((base[k] as number) * Math.pow(1 + revGrowth, i));
      for (const k of COST_KEYS) (l[k] as number) = Math.round((base[k] as number) * Math.pow(1 + costGrowth, i));
      return [y, l];
    }),
  );
}

function ticketsByYear(t: TicketingInputs, sellGrowth: number, priceGrowth: number): Record<number, TicketingInputs> {
  return Object.fromEntries(YEARS.map((y, i) => [y, { ...t, sellThrough: Math.min(0.95, t.sellThrough + sellGrowth * i), products: t.products.map((p) => ({ ...p, price: Math.round(p.price * Math.pow(1 + priceGrowth, i)) })) }]));
}

export function defaultEvents(): EventModel[] {
  const men: EventModel = {
    id: 'ev-men',
    name: 'Toronto 3x3 Men’s Pro Circuit Stop',
    gender: 'men',
    format: 'WT',
    city: 'Toronto',
    operatorId: 'op',
    days: 2,
    eventMonth: 8,
    years: [...YEARS],
    hostingRights: 'in-discussion',
    evidence: 'synthetic',
    employeeHeadcount: 3,
    notes: 'Hypothetical World Tour-type men’s event. Hosting fee, rights and budgets are assumptions — not FIBA commitments.',
    lines: byYear(lines({ fnbShare: 95000, merchandise: 45000, vendorFees: 60000, media: 150000, digital: 45000, hostCityContribution: 500000, hospitality: 220000, fibaHostingFee: 300000, venue: 290000, production: 380000, courtsEquipment: 55000, officials: 35000, athleteTravelAccommodation: 190000, marketing: 210000, insurance: 45000, medicalSecurity: 105000, staffingContractors: 130000, staffingEmployees: 170000, transportation: 35000, dataAccreditation: 25000, antiDopingIntegrity: 10000, otherCosts: 55000 }), 0.22, 0.02),
    ticketing: ticketsByYear({ capacityPerSession: 4500, sessions: 4, sellThrough: 0.66, compsPct: 0.1, refundsPct: 0.02, commissionPct: 0.07, pricesIncludeHst: false, products: [
      { id: 'ga', name: 'Single session', price: 45, mix: 0.65, admissionsPerProduct: 1 },
      { id: 'day', name: 'Day pass', price: 95, mix: 0.22, admissionsPerProduct: 2 },
      { id: 'wkd', name: 'Weekend pass', price: 160, mix: 0.1, admissionsPerProduct: 4 },
      { id: 'vip', name: 'VIP courtside', price: 350, mix: 0.03, admissionsPerProduct: 2 },
    ] }, 0.05, 0.03),
  };
  const women: EventModel = {
    id: 'ev-women',
    name: 'Toronto 3x3 Women’s Series Stop',
    gender: 'women',
    format: 'WS',
    city: 'Toronto',
    operatorId: 'op',
    days: 2,
    eventMonth: 8,
    years: [...YEARS],
    hostingRights: 'in-discussion',
    evidence: 'synthetic',
    employeeHeadcount: 2,
    notes: 'Hypothetical Women’s Series stop. Rights and costs are not assumed to equal the men’s event.',
    lines: byYear(lines({ fnbShare: 40000, merchandise: 18000, vendorFees: 25000, media: 45000, digital: 15000, hostCityContribution: 220000, grantsEligible: 90000, hospitality: 45000, fibaHostingFee: 140000, venue: 140000, production: 200000, courtsEquipment: 25000, officials: 22000, athleteTravelAccommodation: 110000, marketing: 105000, insurance: 28000, medicalSecurity: 55000, staffingContractors: 70000, staffingEmployees: 85000, transportation: 20000, dataAccreditation: 12000, antiDopingIntegrity: 7000, otherCosts: 30000 }), 0.25, 0.02),
    ticketing: ticketsByYear({ capacityPerSession: 3000, sessions: 3, sellThrough: 0.58, compsPct: 0.1, refundsPct: 0.02, commissionPct: 0.07, pricesIncludeHst: false, products: [
      { id: 'ga', name: 'Single session', price: 35, mix: 0.7, admissionsPerProduct: 1 },
      { id: 'day', name: 'Day pass', price: 75, mix: 0.2, admissionsPerProduct: 2 },
      { id: 'wkd', name: 'Weekend pass', price: 120, mix: 0.08, admissionsPerProduct: 3 },
      { id: 'vip', name: 'VIP courtside', price: 250, mix: 0.02, admissionsPerProduct: 2 },
    ] }, 0.05, 0.03),
  };
  return [men, women];
}

export function defaultSponsors(): SponsorDeal[] {
  const d = (id: string, name: string, tier: SponsorDeal['tier'], proposed: number, status: SponsorDeal['status'], probability: number, eventId: string, cash = true, month = 6): SponsorDeal => ({ id, name, tier, proposed, confirmed: status === 'signed' ? proposed : 0, cash, status, probability, paymentMonth: month, exclusivity: tier === 'naming' || tier === 'presenting' || tier === 'category', termYears: 3, fibaRightsConflict: 'unknown', eventId });
  return [
    d('s1', 'Presenting partner (prospect — financial services)', 'presenting', 800000, 'proposal', 0.65, 'ev-men', true, 5),
    d('s2', 'Category partner — beverage', 'category', 300000, 'negotiating', 0.7, 'ev-men', true, 6),
    d('s3', 'Official supplier — apparel', 'official-supplier', 150000, 'prospect', 0.4, 'ev-men', true, 7),
    d('s4', 'Media partner (in-kind airtime)', 'media', 150000, 'prospect', 0.4, 'ev-men', false, 8),
    d('s5', 'Community partner — youth programs', 'community', 80000, 'proposal', 0.5, 'ev-men', true, 4),
    d('s6', 'Women’s Series presenting partner', 'presenting', 450000, 'proposal', 0.6, 'ev-women', true, 5),
    d('s7', 'Category partner — telecom', 'category', 180000, 'prospect', 0.5, 'ev-women', true, 6),
    d('s8', 'Community partner — girls’ sport', 'community', 60000, 'negotiating', 0.6, 'ev-women', true, 4),
  ];
}

/** Relationships that do not depend on the financing arrangement. */
export function baseRelationships(): Relationship[] {
  return [
    { id: 'r-founder', type: 'common-shares', from: 'founder', to: 'op', currency: 'CAD', amount: 100, startYear: 2026, equity: { shares: 100, votesPerShare: 1, classLabel: 'Class A common (placeholder count)', payoutRatio: 0.3 }, evidence: 'synthetic', notes: 'Synthetic placeholder share count. Replace with the share register.' },
    { id: 'r-pe', type: 'common-shares', from: 'pe', to: 'txg', currency: 'USD', amount: 1_600_000, startYear: 2027, equity: { shares: 600, votesPerShare: 1, classLabel: 'LLC membership units (synthetic)' }, evidence: 'synthetic', notes: 'Hypothetical private-equity investment in Three X Global.' },
    { id: 'r-grant', type: 'grant', from: 'gov', to: 'fdn', currency: 'CAD', amount: 0, annual: { 2027: 60000, 2028: 70000, 2029: 80000 }, startYear: 2027, grant: { restricted: true, purpose: 'Girls’ and youth 3x3 development programming', eligibilityVerified: false }, evidence: 'synthetic' },
    { id: 'r-fdn-svc', type: 'service-agreement', from: 'fdn', to: 'op', label: 'Community programming services', currency: 'CAD', amount: 0, annual: { 2027: 45000, 2028: 50000, 2029: 55000 }, startYear: 2027, fee: { basis: 'fixed', servicesInCanadaPct: 1, documentedFmv: true }, evidence: 'assumption', notes: 'The Foundation delivers community clinics that sponsors require; the operator pays a fair-market-value fee under a written agreement (to be prepared).' },
    { id: 'r-hosting', type: 'hosting', from: 'fiba', to: 'op', label: 'FIBA hosting agreement', currency: 'CAD', amount: 0, startYear: 2027, evidence: 'pending', notes: 'Descriptive: the hosting fee is carried in the event budgets.' },
  ];
}

export type ArrangementId = 'full-loan' | 'minority-equity' | 'hybrid' | 'commercial-partnership';

export const ARRANGEMENTS: { id: ArrangementId; name: string; summary: string }[] = [
  { id: 'full-loan', name: 'Full shareholder loan', summary: 'Three X Global lends CAD 2,000,000 at 7% for 3 years; interest annually, principal at maturity. No shares.' },
  { id: 'minority-equity', name: 'Minority equity investment', summary: 'Three X Global subscribes CAD 2,000,000 for a 40% voting common-share stake.' },
  { id: 'hybrid', name: 'Hybrid equity and debt', summary: 'CAD 1,200,000 loan at 7% plus CAD 800,000 for a 30% common-share stake.' },
  { id: 'commercial-partnership', name: 'Contractual commercial partnership', summary: 'Three X Global funds CAD 2,000,000 under a joint-venture agreement in exchange for 35% of event EBITDA.' },
];

export function arrangementRelationships(id: ArrangementId, amountCad = 2_000_000): Relationship[] {
  const loan = (amt: number, rid = 'r-loan'): Relationship => ({ id: rid, type: 'intercompany-loan', from: 'txg', to: 'op', currency: 'CAD', amount: amt, startYear: 2027, loan: { rate: 0.07, termYears: 3, repayment: 'maturity', cashInterest: true }, evidence: 'synthetic', label: 'Shareholder / intercompany loan' });
  const shares = (amt: number, pct: number, rid = 'r-equity'): Relationship => ({ id: rid, type: 'common-shares', from: 'txg', to: 'op', currency: 'CAD', amount: amt, startYear: 2027, equity: { shares: Math.round((100 * pct) / (1 - pct)), votesPerShare: 1, classLabel: 'Class B common', payoutRatio: 0.3 }, evidence: 'synthetic' });
  switch (id) {
    case 'full-loan':
      return [loan(amountCad)];
    case 'minority-equity':
      return [shares(amountCad, 0.4)];
    case 'hybrid':
      return [loan(amountCad * 0.6), shares(amountCad * 0.4, 0.3)];
    case 'commercial-partnership':
      return [
        { id: 'r-jv-fund', type: 'capital-contribution', from: 'txg', to: 'op', label: 'Joint-venture funding contribution', currency: 'CAD', amount: amountCad, startYear: 2027, evidence: 'synthetic', notes: 'Funding without shares. Its tax character (contribution, inducement, partnership capital) is unresolved.' },
        { id: 'r-jv', type: 'jv', from: 'txg', to: 'op', label: 'Contractual joint venture — 35% of event EBITDA', currency: 'CAD', amount: 0, startYear: 2027, revenueShare: { pct: 0.35, base: 'event-ebitda', characterization: 'partnership-pe' }, evidence: 'synthetic' },
      ];
  }
}

export function makeScenario(arrangement: ArrangementId = 'hybrid', name?: string): Scenario {
  const a = ARRANGEMENTS.find((x) => x.id === arrangement)!;
  return {
    id: `scn-${arrangement}`,
    name: name ?? a.name,
    description: `${a.summary} One men’s and one women’s professional FIBA 3x3 event in Toronto each year 2027–2029 (synthetic demonstration data; hosting rights not confirmed).`,
    createdAt: now(),
    updatedAt: now(),
    baseline: 'synthetic',
    years: [...YEARS],
    fx: { cadPerUsd: { 2027: 1.37, 2028: 1.36, 2029: 1.35 }, mode: 'forecast' },
    entities: defaultEntities(),
    relationships: [...baseRelationships(), ...arrangementRelationships(arrangement)],
    events: defaultEvents(),
    sponsors: defaultSponsors(),
    venues: [
      { id: 'v1', name: 'Venue option A (outdoor plaza — to be identified)', availabilityStatus: 'unknown', indoor: false, notes: 'Do not assume availability. Enter quotes and permits as received.' },
      { id: 'v2', name: 'Venue option B (indoor arena — to be identified)', availabilityStatus: 'unknown', indoor: true },
    ],
    tasks: defaultTasks(),
    fiba: [],
    investor: { investmentUsd: 1_600_000, investYear: 2027, instrument: 'common', ownershipPct: 0.6, prefRate: 0.08, loanRate: 0.1, exitYear: 2029, exitMethod: 'ebitda-multiple', exitMultiple: 8, distributionPolicy: 0.5, investorTaxRate: 0 },
    taxSettings: { sbdTreatment: 'auto', disallowUndocumentedFees: false, ccaYears: 3, usStateModel: 'NY', treatyClaimed: true },
    assumptions: { sponsorshipBasis: 'expected', usUnknownAs: 'pass-through', defaultPayout: 0.3 },
    capex: { op: { 2027: 150000, 2028: 50000, 2029: 50000 } },
    monthlyYear: 2027,
    foundation: { purposes: [], governingDocsLoaded: false, programCosts: { 2027: 95000, 2028: 110000, 2029: 125000 } },
    roles: { operator: 'op', usVenture: 'txg', foundation: 'fdn', investor: 'pe', founder: 'founder' },
    tags: ['synthetic'],
  };
}

export function defaultTasks() {
  const t = (id: string, area: string, title: string, critical = false, dependsOn: string[] = []) => ({ id, area, title, owner: '', status: 'not-started' as const, critical, dependsOn });
  return [
    t('t1', 'FIBA negotiations', 'Obtain current Pro-Circuit and Women’s Series Handbooks and host requirements', true),
    t('t2', 'Event rights', 'Negotiate and execute hosting agreement(s) — men’s and women’s separately', true, ['t1']),
    t('t3', 'Venue selection', 'Shortlist Toronto venues; obtain quotes, holds and permit requirements', true),
    t('t4', 'Permits', 'Municipal special-event permits, road closures, alcohol licensing', true, ['t3']),
    t('t5', 'Insurance', 'Event liability, cancellation and participant accident insurance quotes', true),
    t('t6', 'Sponsorship prospecting', 'Build sponsor pipeline consistent with FIBA rights reserved to FIBA', false, ['t2']),
    t('t7', 'Production partners', 'Select production and broadcast partner (FIBA feed requirements)', false, ['t2']),
    t('t8', 'Government relationships', 'Host-city and tourism funding applications; confirm eligibility', false),
    t('t9', 'Community programming', 'Foundation program plan, budget and FMV services agreement', false),
    t('t10', 'Staffing', 'Hiring plan: employees vs contractors; payroll registrations', false),
    t('t11', 'Ticket sales', 'Ticketing platform, pricing, HST setup, refund policy', false, ['t3']),
    t('t12', 'Structure', 'Confirm LLC classification, cap table and financing documents with counsel', true),
    t('t13', 'Event settlement', 'Settlement process with venue, FIBA and vendors', false),
    t('t14', 'Launch readiness', 'Go / no-go review with all critical prerequisites met', true, ['t2', 't3', 't4', 't5', 't12']),
  ];
}

export function defaultScenarios(): Scenario[] {
  return ARRANGEMENTS.map((a) => makeScenario(a.id));
}
