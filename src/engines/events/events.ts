// Event-level (Level 1) economics: one men's or women's event in one year.
import type { EventLineItems, EventModel, Scenario, SponsorDeal, TicketingInputs } from '../../types/domain';
import { ruleValue } from '../tax/rules';

export interface TicketResult {
  capacity: number;
  paidAdmissions: number;
  comps: number;
  products: { id: string; name: string; sold: number; revenue: number }[];
  grossInclHst: number;
  netRevenue: number; // after refunds, before commissions, excluding HST
  refunds: number;
  commission: number;
  hst: number;
  averageNetPerAdmission: number;
}

export function computeTickets(t: TicketingInputs | undefined, hstRate: number): TicketResult {
  if (!t) return { capacity: 0, paidAdmissions: 0, comps: 0, products: [], grossInclHst: 0, netRevenue: 0, refunds: 0, commission: 0, hst: 0, averageNetPerAdmission: 0 };
  const capacity = Math.max(0, t.capacityPerSession) * Math.max(0, t.sessions);
  const comps = capacity * clamp01(t.compsPct);
  const paidAdmissions = (capacity - comps) * clamp01(t.sellThrough);
  const denom = t.products.reduce((a, p) => a + p.mix * Math.max(1, p.admissionsPerProduct), 0);
  const products = t.products.map((p) => {
    const sold = denom ? (paidAdmissions * p.mix) / denom : 0;
    return { id: p.id, name: p.name, sold, revenue: sold * p.price };
  });
  const listed = products.reduce((a, p) => a + p.revenue, 0);
  const preTax = t.pricesIncludeHst ? listed / (1 + hstRate) : listed;
  const refunds = preTax * clamp01(t.refundsPct);
  const netRevenue = preTax - refunds;
  const hst = netRevenue * hstRate;
  const grossInclHst = netRevenue + hst;
  const commission = grossInclHst * clamp01(t.commissionPct);
  return {
    capacity,
    paidAdmissions,
    comps,
    products,
    grossInclHst,
    netRevenue,
    refunds,
    commission,
    hst,
    averageNetPerAdmission: paidAdmissions ? netRevenue / paidAdmissions : 0,
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n || 0));

export type SponsorshipBasis = 'expected' | 'confirmed' | 'proposed';

export function sponsorValue(d: SponsorDeal, basis: SponsorshipBasis): number {
  if (d.status === 'lost') return 0;
  if (basis === 'confirmed') return d.status === 'signed' ? d.confirmed : 0;
  if (basis === 'proposed') return d.status === 'signed' ? d.confirmed : d.proposed;
  return d.status === 'signed' ? d.confirmed : d.proposed * clamp01(d.probability);
}

export interface PayrollResult {
  salaries: number;
  cpp: number;
  cpp2: number;
  ei: number;
  employerTotal: number;
  verified: boolean;
}

/** Employer payroll contributions using average salary per employee (2026 parameters; later years flagged). */
export function employerPayroll(salaries: number, headcount: number, year: number): PayrollResult {
  if (!salaries || !headcount) return { salaries, cpp: 0, cpp2: 0, ei: 0, employerTotal: 0, verified: true };
  const avg = salaries / headcount;
  const YMPE = 74600;
  const YAMPE = 85000;
  const EXEMPT = 3500;
  const MIE = 68900;
  const cppRate = ruleValue('ca-cpp', year);
  const eiRate = ruleValue('ca-ei', year);
  const cpp = Math.max(0, Math.min(avg, YMPE) - EXEMPT) * cppRate.value * headcount;
  const cpp2 = Math.max(0, Math.min(avg, YAMPE) - YMPE) * 0.04 * headcount;
  const ei = Math.min(avg, MIE) * eiRate.value * headcount;
  return { salaries, cpp, cpp2, ei, employerTotal: cpp + cpp2 + ei, verified: cppRate.verified && eiRate.verified };
}

/** Ontario EHT on total remuneration for an employer (exemption only if eligible and group payroll < $5M). */
export function ontarioEht(totalPayroll: number, eligibleForExemption = true): number {
  if (totalPayroll <= 0) return 0;
  const brackets: [number, number][] = [
    [200000, 0.0098],
    [230000, 0.01101],
    [260000, 0.01223],
    [290000, 0.01344],
    [320000, 0.01465],
    [350000, 0.01586],
    [380000, 0.01708],
    [400000, 0.01829],
  ];
  const rate = brackets.find(([cap]) => totalPayroll <= cap)?.[1] ?? 0.0195;
  const exemption = eligibleForExemption && totalPayroll < 5_000_000 ? 1_000_000 : 0;
  return Math.max(0, totalPayroll - exemption) * rate;
}

export interface EventYearResult {
  eventId: string;
  year: number;
  name: string;
  gender: EventModel['gender'];
  format: EventModel['format'];
  operatorId: string;
  eventMonth: number;
  tickets: TicketResult;
  sponsorCash: number;
  sponsorInKind: number;
  sponsorDeals: { id: string; name: string; value: number; status: string; month: number; cash: boolean }[];
  revenue: Record<string, number>;
  revenueTotal: number;
  revenueCash: number;
  costs: Record<string, number>;
  costTotal: number;
  costCash: number;
  payroll: PayrollResult;
  ebitda: number;
  margin: number;
  hstCollected: number;
  breakEvenGap: number;
  breakEvenTicketPrice: number | null;
  nonResidentAthletePayments: number;
}

export const REVENUE_LABELS: Record<string, string> = {
  sponsorship: 'Sponsorship (cash)',
  sponsorshipInKind: 'Sponsorship (in-kind)',
  tickets: 'Ticket sales (net)',
  hospitality: 'Hospitality',
  fnbShare: 'Food & beverage share',
  merchandise: 'Merchandise',
  vendorFees: 'Vendor fees',
  media: 'Media rights / production',
  digital: 'Digital / data',
  hostCityContribution: 'Host-city contribution',
  grantsEligible: 'Eligible grants',
  other: 'Other revenue',
};

export const COST_LABELS: Record<string, string> = {
  fibaHostingFee: 'FIBA hosting / licence fee',
  venue: 'Venue',
  production: 'Production & broadcast',
  courtsEquipment: 'Courts & competition equipment',
  officials: 'Officials',
  athleteTravelAccommodation: 'Athlete travel & accommodation',
  marketing: 'Marketing',
  insurance: 'Insurance',
  medicalSecurity: 'Medical & security',
  staffingContractors: 'Staffing — contractors',
  staffingEmployees: 'Staffing — employee salaries',
  payrollTaxes: 'Employer payroll contributions',
  transportation: 'Transportation',
  dataAccreditation: 'Data & accreditation',
  antiDopingIntegrity: 'Anti-doping & integrity',
  ticketCommission: 'Ticketing commissions',
  otherCosts: 'Other costs',
  inKindCost: 'In-kind sponsorship (matching cost)',
  contingency: 'Contingency',
};

export function computeEventYear(ev: EventModel, year: number, scn: Scenario, basis: SponsorshipBasis): EventYearResult | null {
  if (!ev.years.includes(year)) return null;
  const L: EventLineItems | undefined = ev.lines[year];
  if (!L) return null;
  const hst = ruleValue('ca-hst-on', year).value;
  const tickets = computeTickets(ev.ticketing[year], hst);
  const deals = scn.sponsors.filter((d) => d.eventId === ev.id);
  const sponsorDeals = deals.map((d) => ({ id: d.id, name: d.name, value: sponsorValue(d, basis), status: d.status, month: d.paymentMonth, cash: d.cash }));
  let sponsorCash = sponsorDeals.filter((d) => d.cash).reduce((a, d) => a + d.value, 0);
  const sponsorInKind = sponsorDeals.filter((d) => !d.cash).reduce((a, d) => a + d.value, 0);
  if (L.sponsorshipOverride !== undefined && L.sponsorshipOverride !== null && !Number.isNaN(L.sponsorshipOverride) && deals.length === 0) sponsorCash = L.sponsorshipOverride;

  const revenue: Record<string, number> = {
    sponsorship: sponsorCash,
    sponsorshipInKind: sponsorInKind,
    tickets: tickets.netRevenue,
    hospitality: L.hospitality,
    fnbShare: L.fnbShare,
    merchandise: L.merchandise,
    vendorFees: L.vendorFees,
    media: L.media,
    digital: L.digital,
    hostCityContribution: L.hostCityContribution,
    grantsEligible: L.grantsEligible,
    other: L.other,
  };
  const revenueTotal = Object.values(revenue).reduce((a, b) => a + (b || 0), 0);
  const revenueCash = revenueTotal - sponsorInKind;
  const payroll = employerPayroll(L.staffingEmployees, ev.employeeHeadcount ?? 0, year);
  const baseCosts: Record<string, number> = {
    fibaHostingFee: L.fibaHostingFee,
    venue: L.venue,
    production: L.production,
    courtsEquipment: L.courtsEquipment,
    officials: L.officials,
    athleteTravelAccommodation: L.athleteTravelAccommodation,
    marketing: L.marketing,
    insurance: L.insurance,
    medicalSecurity: L.medicalSecurity,
    staffingContractors: L.staffingContractors,
    staffingEmployees: L.staffingEmployees,
    payrollTaxes: payroll.employerTotal,
    transportation: L.transportation,
    dataAccreditation: L.dataAccreditation,
    antiDopingIntegrity: L.antiDopingIntegrity,
    ticketCommission: tickets.commission,
    otherCosts: L.otherCosts + (L.nonResidentAthletePayments || 0),
  };
  const preContingency = Object.values(baseCosts).reduce((a, b) => a + (b || 0), 0);
  const contingency = preContingency * Math.max(0, L.contingencyPct || 0);
  const costs: Record<string, number> = { ...baseCosts, inKindCost: sponsorInKind, contingency };
  const costTotal = preContingency + contingency + sponsorInKind;
  const costCash = costTotal - sponsorInKind;
  const ebitda = revenueTotal - costTotal;
  const paid = tickets.paidAdmissions;
  const gap = Math.max(0, -ebitda);
  // Price needed per admission (on top of current) to close the gap, before refunds/commission adjustments
  const effective = (1 - (ev.ticketing[year]?.refundsPct ?? 0)) * (1 - (ev.ticketing[year]?.commissionPct ?? 0) * (1 + hst));
  const breakEvenTicketPrice = paid > 0 ? tickets.averageNetPerAdmission + gap / (paid * Math.max(0.01, effective)) : null;
  return {
    eventId: ev.id,
    year,
    name: ev.name,
    gender: ev.gender,
    format: ev.format,
    operatorId: ev.operatorId,
    eventMonth: ev.eventMonth,
    tickets,
    sponsorCash,
    sponsorInKind,
    sponsorDeals,
    revenue,
    revenueTotal,
    revenueCash,
    costs,
    costTotal,
    costCash,
    payroll,
    ebitda,
    margin: revenueTotal ? ebitda / revenueTotal : 0,
    hstCollected: tickets.hst + (revenueCash - tickets.netRevenue - (L.grantsEligible || 0) - (L.hostCityContribution || 0)) * hst,
    breakEvenGap: gap,
    breakEvenTicketPrice,
    nonResidentAthletePayments: L.nonResidentAthletePayments || 0,
  };
}

export function emptyLines(): EventLineItems {
  return {
    fnbShare: 0,
    merchandise: 0,
    vendorFees: 0,
    media: 0,
    digital: 0,
    hostCityContribution: 0,
    grantsEligible: 0,
    hospitality: 0,
    other: 0,
    fibaHostingFee: 0,
    venue: 0,
    production: 0,
    courtsEquipment: 0,
    officials: 0,
    athleteTravelAccommodation: 0,
    marketing: 0,
    insurance: 0,
    medicalSecurity: 0,
    staffingContractors: 0,
    staffingEmployees: 0,
    transportation: 0,
    dataAccreditation: 0,
    antiDopingIntegrity: 0,
    otherCosts: 0,
    contingencyPct: 0,
    nonResidentAthletePayments: 0,
  };
}
