// Core domain types for THREE X | Venture Intelligence.
// Every monetary value is stored in the currency stated on the record; the engine
// converts to CAD (the operating currency) for computation and to the display
// currency for presentation.

export type Currency = 'CAD' | 'USD';
export type Year = number;
/** A value per year, e.g. { 2027: 100000, 2028: 120000 } */
export type Series = Record<number, number>;

/** Evidence classification used throughout the app (source hierarchy, PRD §18 + §12). */
export type DataStatus =
  | 'confirmed-contract' // confirmed by an executed agreement
  | 'legislation' // enacted legislation or regulation
  | 'official-rule' // official FIBA rule / government guidance
  | 'corporate-record' // corporate filing
  | 'workbook' // imported management financial model
  | 'historical' // historical reference / guide
  | 'assumption' // user or management assumption
  | 'pending' // pending counterparty confirmation
  | 'synthetic' // demonstration data
  | 'not-applicable';

export type Jurisdiction = 'CA' | 'US' | 'INTL' | 'NA';

export type EntityKind =
  | 'investor'
  | 'us-llc'
  | 'ca-corp'
  | 'ca-nfp'
  | 'individual'
  | 'fiba'
  | 'sponsor'
  | 'government'
  | 'venue'
  | 'vendor'
  | 'staff'
  | 'fans'
  | 'custom';

export type UsClassification = 'unknown' | 'disregarded' | 'partnership' | 'corporation';
export type Tri = 'yes' | 'no' | 'unknown';

export interface EntityTaxProfile {
  /** Residence for tax purposes (CA, US, other). */
  residence: Jurisdiction;
  /** U.S. federal classification of an LLC; must be confirmed from evidence (Form 8832 / default rules). */
  usClassification?: UsClassification;
  /** For pass-through LLCs: share of members that are U.S. residents, and that are corporations. */
  memberUsResidentShare?: number;
  memberCorporateShare?: number;
  /** Combined marginal federal+state rate assumed for pass-through members (user assumption). */
  memberMarginalRate?: number;
  /** Treaty limitation-on-benefits status (Art. XXIX A). */
  lobQualifying?: Tri;
  /** New York apportionment (receipts factor) for an Article 9-A corporate taxpayer (assumption). */
  nyApportionment?: number;
  /** Whether the entity deals at arm's length with the operator (question of fact). */
  armsLengthWithOperator?: Tri;
  /** NFP attributes — never assumed. */
  registeredCharity?: Tri;
  rcaaa?: Tri;
  solicitingCorporation?: Tri;
  /** Is the entity public / listed (relevant to CCPC para (c)). */
  listed?: boolean;
  /** Associated-group taxable capital in Canada (CAD) used for the business-limit and EIFEL tests. */
  associatedTaxableCapital?: number;
  /** Adjusted aggregate investment income of the associated group (CAD). */
  aaii?: number;
  /** Share of the $500,000 business limit allocated to this corporation (0-1). */
  businessLimitShare?: number;
}

export interface EntityNode {
  id: string;
  name: string;
  kind: EntityKind;
  jurisdiction: Jurisdiction;
  x: number;
  y: number;
  /** Whether this entity is inside the "group" for elimination purposes. */
  inGroup: boolean;
  tax: EntityTaxProfile;
  notes?: string;
  /** References to fact-register entries (private pack) or source ids. */
  factRefs?: string[];
  evidence: DataStatus;
  /** Annual overhead for this entity (in entity currency). */
  overhead?: Series;
  currency: Currency;
  openingCash?: number;
}

export type RelType =
  | 'common-shares'
  | 'preferred-shares'
  | 'convertible'
  | 'intercompany-loan'
  | 'third-party-loan'
  | 'capital-contribution'
  | 'management-agreement'
  | 'license'
  | 'jv'
  | 'hosting'
  | 'sponsorship'
  | 'grant'
  | 'donation'
  | 'vendor'
  | 'dividend'
  | 'interest'
  | 'principal'
  | 'revenue-share'
  | 'guarantee'
  | 'restricted-funding'
  | 'service-agreement';

export type Repayment = 'annual' | 'maturity' | 'custom';

export interface LoanTerms {
  rate: number; // annual nominal
  termYears: number;
  repayment: Repayment;
  /** Custom principal repayment per year (in relationship currency). */
  customSchedule?: Series;
  /** Interest computed by reference to profits/revenue (treaty Art. XI(6)(b)). */
  participating?: boolean;
  /** Arm's-length benchmark rate if one has been documented (transfer pricing). */
  benchmarkRate?: number;
  /** Interest paid in cash (true) or accrued/capitalised (false). */
  cashInterest: boolean;
}

export interface EquityTerms {
  shares: number;
  votesPerShare: number;
  classLabel: string;
  /** Preferred dividend rate on subscription price (preferred shares). */
  prefRate?: number;
  prefCumulative?: boolean;
  liquidationPrefMultiple?: number;
  participating?: boolean;
  /** Policy: % of distributable after-tax cash paid as dividends each year. */
  payoutRatio?: number;
}

export interface ConvertibleTerms {
  rate: number;
  termYears: number;
  /** Shares receivable on conversion as a % of post-conversion shares. */
  conversionPct: number;
  /** Convert at maturity? */
  convertAtMaturity: boolean;
  /** Conversion votes per share. */
  votesPerShare: number;
}

export interface FeeTerms {
  basis: 'fixed' | 'pct-revenue' | 'pct-ebitda';
  amountPerYear?: Series;
  pct?: number;
  /** Share of the services physically performed in Canada (Reg. 105 / PE exposure). */
  servicesInCanadaPct: number;
  /** Is there a written agreement with fair-market-value support? */
  documentedFmv: boolean;
  /** For licences: type of intellectual property (treaty Art. XII). */
  ipType?: 'trademark' | 'software' | 'know-how' | 'copyright' | 'event-rights' | 'other';
}

export interface RevenueShareTerms {
  pct: number;
  base: 'event-revenue' | 'event-ebitda';
  /** How the arrangement is characterised for Canadian tax purposes (unresolved legal question). */
  characterization: 'contractual-no-pe' | 'partnership-pe' | 'participating-payment';
}

export interface GrantTerms {
  restricted: boolean;
  purpose: string;
  /** Is the recipient's eligibility for this funder verified? */
  eligibilityVerified: boolean;
}

export interface ControlRights {
  /** Board seats the holder may appoint. */
  boardSeats?: number;
  /** Total board size of the target. */
  boardSize?: number;
  /** Veto rights listed in a shareholders' agreement. */
  vetoRights?: string[];
  /** Is there a unanimous shareholder agreement restricting directors? */
  usa?: boolean;
  /** Right to acquire additional shares (options, warrants, conversion) — deemed exercised for control tests. */
  optionShares?: number;
  optionVotesPerShare?: number;
  /** Economic dependence indicators for de facto control. */
  economicDependence?: boolean;
}

export interface Relationship {
  id: string;
  type: RelType;
  from: string; // payer / investor / grantor
  to: string; // recipient / investee
  label?: string;
  currency: Currency;
  /** Principal / subscription / annual amount, depending on type. */
  amount: number;
  /** For recurring commercial flows. */
  annual?: Series;
  startYear: number;
  /** Optional fixed FX (CAD per USD) at transaction date. */
  fxAtTransaction?: number;
  loan?: LoanTerms;
  equity?: EquityTerms;
  convertible?: ConvertibleTerms;
  fee?: FeeTerms;
  revenueShare?: RevenueShareTerms;
  grant?: GrantTerms;
  rights?: ControlRights;
  guaranteeFeePct?: number;
  evidence: DataStatus;
  sourceRefs?: string[];
  notes?: string;
}

export type Gender = 'men' | 'women' | 'mixed';
export type CompetitionFormat = 'WT' | 'WS' | 'Challenger' | 'Endorsed' | 'Grassroots' | 'Combined-WT-WS';

export interface TicketProduct {
  id: string;
  name: string;
  price: number; // CAD, before HST
  mix: number; // share of products sold
  admissionsPerProduct: number;
}

export interface TicketingInputs {
  capacityPerSession: number;
  sessions: number;
  sellThrough: number; // share of available capacity sold as paid admissions
  compsPct: number; // complimentary share of capacity
  refundsPct: number;
  commissionPct: number; // ticketing / merchant fees as % gross
  products: TicketProduct[];
  /** Are listed prices inclusive of HST? */
  pricesIncludeHst: boolean;
}

export interface SponsorDeal {
  id: string;
  name: string;
  tier: 'naming' | 'presenting' | 'category' | 'official-supplier' | 'corporate-partner' | 'media' | 'community' | 'activation' | 'in-kind';
  proposed: number; // CAD per year
  confirmed: number; // CAD per year
  cash: boolean;
  status: 'prospect' | 'proposal' | 'negotiating' | 'signed' | 'lost';
  probability: number;
  paymentMonth: number; // 1-12 month of payment in event year
  exclusivity: boolean;
  termYears: number;
  fibaRightsConflict: Tri;
  eventId?: string; // allocate to event
}

export interface EventLineItems {
  // Revenue (CAD, before HST)
  sponsorshipOverride?: number; // if set, overrides sponsor pipeline
  fnbShare: number;
  merchandise: number;
  vendorFees: number;
  media: number;
  digital: number;
  hostCityContribution: number;
  grantsEligible: number;
  hospitality: number;
  other: number;
  // Costs (CAD)
  fibaHostingFee: number;
  venue: number;
  production: number;
  courtsEquipment: number;
  officials: number;
  athleteTravelAccommodation: number;
  marketing: number;
  insurance: number;
  medicalSecurity: number;
  staffingContractors: number;
  staffingEmployees: number; // salaries (payroll taxes added by engine)
  transportation: number;
  dataAccreditation: number;
  antiDopingIntegrity: number;
  otherCosts: number;
  contingencyPct: number;
  /** Payments to non-resident athletes/teams made by the host (appearance fees), CAD. */
  nonResidentAthletePayments: number;
}

export interface EventModel {
  id: string;
  name: string;
  gender: Gender;
  format: CompetitionFormat;
  city: string;
  venueId?: string;
  operatorId: string; // entity that contracts and bears costs/revenue
  days: number;
  eventMonth: number; // 1-12
  years: number[]; // years the event runs
  /** Per-year line items (values in CAD). */
  lines: Record<number, EventLineItems>;
  ticketing: Record<number, TicketingInputs>;
  hostingRights: 'not-started' | 'in-discussion' | 'term-sheet' | 'executed';
  evidence: DataStatus;
  notes?: string;
  /** Employees count for payroll-tax computations. */
  employeeHeadcount?: number;
}

export interface InvestorTerms {
  /** PE investment into Three X Global (USD). */
  investmentUsd: number;
  investYear: number;
  instrument: 'common' | 'preferred' | 'loan';
  ownershipPct: number; // economic ownership of TXG on a fully diluted basis
  prefRate: number; // preferred return
  loanRate: number;
  exitYear: number;
  exitMethod: 'ebitda-multiple' | 'fixed-value';
  exitMultiple: number;
  exitValueUsd?: number;
  /** Share of TXG distributable cash paid out each year. */
  distributionPolicy: number;
  /** Investor-level tax rate on returns (assumption) for the after-tax view. */
  investorTaxRate: number;
}

export interface TaxSettings {
  sbdTreatment: 'auto' | 'assume-eligible' | 'assume-ineligible';
  /** Apply deduction disallowance to undocumented intercompany fees (risk case). */
  disallowUndocumentedFees: boolean;
  /** Capital cost allowance proxy (straight-line years) for capex. */
  ccaYears: number;
  usStateModel: 'NY' | 'none';
  /** Assume treaty benefits are claimed and supported by forms (NR301 etc.). */
  treatyClaimed: boolean;
}

export interface Venue {
  id: string;
  name: string;
  rentalCost?: number;
  capacity?: number;
  indoor?: boolean;
  transitScore?: string;
  permittedCommercial?: string;
  sponsorshipRestrictions?: string;
  ticketingFeasible?: Tri;
  broadcastInfrastructure?: Tri;
  accessibility?: string;
  hospitalityPotential?: string;
  productionCostEstimate?: number;
  permitsRequired?: string;
  insuranceRequirements?: string;
  availabilityStatus: 'unknown' | 'inquiry' | 'hold' | 'confirmed' | 'unavailable';
  notes?: string;
}

export interface OpsTask {
  id: string;
  area: string;
  title: string;
  owner: string;
  deadline?: string;
  status: 'not-started' | 'in-progress' | 'blocked' | 'done';
  budget?: number;
  contractRef?: string;
  dependsOn?: string[];
  financialImpact?: string;
  entityId?: string;
  critical: boolean;
}

export interface FibaRequirementState {
  id: string; // requirement id
  status?: string; // override classification
  note?: string;
  contractRef?: string;
  done?: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  baseline: 'synthetic' | 'workbook' | 'custom';
  years: number[];
  fx: { cadPerUsd: Series; mode: 'forecast' | 'transaction' };
  entities: EntityNode[];
  relationships: Relationship[];
  events: EventModel[];
  sponsors: SponsorDeal[];
  venues: Venue[];
  tasks: OpsTask[];
  fiba: FibaRequirementState[];
  investor: InvestorTerms;
  taxSettings: TaxSettings;
  assumptions: {
    sponsorshipBasis: 'expected' | 'confirmed' | 'proposed';
    /** How to illustrate an LLC whose U.S. classification is unknown. */
    usUnknownAs: 'corporation' | 'pass-through';
    /** Share of the operator's distributable after-tax cash paid as dividends when equity terms do not specify. */
    defaultPayout: number;
    /** Months of costs incurred before the event for the monthly view. */
  };
  /** Capex by entity (CAD) used for D&A / CCA proxy. */
  capex?: Record<string, Series>;
  /** Monthly view year. */
  monthlyYear: number;
  /** Governing-document facts for the Foundation (populated from the private fact pack). */
  foundation: {
    purposes: { no: number; title: string; summary?: string }[];
    directorsCount?: number;
    directorOverlapWithOperator?: boolean;
    membershipRestrictedToDirectors?: boolean;
    liquidationToQualifiedDonees?: boolean;
    governingDocsLoaded: boolean;
    programCosts?: Series;
  };
  /** IDs of entities with special roles. */
  roles: { operator: string; usVenture: string; foundation: string; investor: string; founder?: string };
  tags?: string[];
}

export type Severity = 'info' | 'watch' | 'warning' | 'critical';

export interface SourceRef {
  /** Provision id in the bundled knowledge base, a document id, or a register id. */
  id: string;
  label: string;
  pinpoint?: string;
}

export interface Issue {
  id: string;
  severity: Severity;
  area: 'tax-ca' | 'tax-us' | 'withholding' | 'control' | 'nfp' | 'fiba' | 'finance' | 'data' | 'governance' | 'securities';
  title: string;
  plain: string;
  expert?: string;
  sources: SourceRef[];
  resolution: string;
  /** Requires professional validation. */
  professional: boolean;
}
