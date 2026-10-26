// Deterministic financial primitives. Pure functions — no side effects, no I/O.
import type { Currency, LoanTerms, Series } from '../../types/domain';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const sumSeries = (s: Series | undefined, years: number[]) => sum(years.map((y) => s?.[y] ?? 0));

/** Convert an amount between CAD and USD. `cadPerUsd` must be > 0. */
export function convert(amount: number, from: Currency, to: Currency, cadPerUsd: number): number {
  if (!(cadPerUsd > 0)) throw new Error('FX rate must be positive');
  if (from === to) return amount;
  return from === 'USD' ? amount * cadPerUsd : amount / cadPerUsd;
}

export interface LoanYear {
  year: number;
  opening: number;
  drawdown: number;
  interest: number;
  interestPaid: number;
  interestAccrued: number;
  principal: number;
  closing: number;
  averageBalance: number;
}

/**
 * Loan schedule over the scenario years. Drawdown occurs at the start of `startYear`.
 * - annual: equal principal instalments over the term (straight-line amortization)
 * - maturity: bullet repayment in the final term year
 * - custom: user schedule (excess is ignored; remaining balance repaid at maturity)
 * Interest accrues on the opening balance (annual compounding of accrued interest when not paid in cash).
 */
export function loanSchedule(principalAmt: number, startYear: number, terms: LoanTerms, years: number[]): LoanYear[] {
  if (principalAmt < 0) throw new Error('Loan principal cannot be negative');
  if (terms.termYears <= 0) throw new Error('Loan term must be positive');
  const out: LoanYear[] = [];
  let balance = 0;
  const maturityYear = startYear + terms.termYears - 1;
  const straight = principalAmt / terms.termYears;
  for (const year of years) {
    const drawdown = year === startYear ? principalAmt : 0;
    const opening = balance;
    balance += drawdown;
    if (year < startYear) {
      out.push({ year, opening: 0, drawdown: 0, interest: 0, interestPaid: 0, interestAccrued: 0, principal: 0, closing: 0, averageBalance: 0 });
      continue;
    }
    const interest = balance * terms.rate;
    const interestPaid = terms.cashInterest ? interest : 0;
    const interestAccrued = terms.cashInterest ? 0 : interest;
    if (interestAccrued) balance += interestAccrued; // capitalised (PIK) interest
    let principal = 0;
    if (year < maturityYear) {
      if (terms.repayment === 'annual') principal = Math.min(balance, straight);
      else if (terms.repayment === 'custom') principal = Math.min(balance, terms.customSchedule?.[year] ?? 0);
    } else {
      principal = balance; // everything outstanding is due at (or after) maturity
    }
    const closing = balance - principal;
    out.push({ year, opening, drawdown, interest, interestPaid, interestAccrued, principal, closing, averageBalance: (opening + drawdown + closing) / 2 });
    balance = closing;
  }
  return out;
}

/** Net present value of cash flows at period indices 0..n-1. */
export function npv(rate: number, flows: number[]): number {
  return flows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
}

/**
 * Internal rate of return using bisection with a Newton refinement.
 * Returns null when no sign change exists (IRR undefined) — the UI must say so rather than show a number.
 */
export function irr(flows: number[]): number | null {
  if (flows.length < 2) return null;
  const hasPos = flows.some((f) => f > 0);
  const hasNeg = flows.some((f) => f < 0);
  if (!hasPos || !hasNeg) return null;
  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo, flows);
  let fHi = npv(hi, flows);
  if (fLo * fHi > 0) {
    // try to find a bracket
    let found = false;
    for (const h of [1, 2, 5, 20, 50]) {
      hi = h;
      fHi = npv(hi, flows);
      if (fLo * fHi <= 0) {
        found = true;
        break;
      }
    }
    if (!found) return null;
  }
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, flows);
    if (Math.abs(fMid) < 1e-9) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
    if (hi - lo < 1e-12) break;
  }
  return (lo + hi) / 2;
}

/** Multiple on invested capital = total distributions / total invested. */
export function moic(flows: number[]): number | null {
  const invested = -sum(flows.filter((f) => f < 0));
  const returned = sum(flows.filter((f) => f > 0));
  if (invested <= 0) return null;
  return returned / invested;
}

export interface CapHolder {
  holderId: string;
  shares: number;
  votesPerShare: number;
  classLabel: string;
}

export interface CapTableRow extends CapHolder {
  votes: number;
  pctShares: number;
  pctVotes: number;
}

/** Ownership and voting percentages; pass options/convertibles as additional rows to test "deemed exercised". */
export function capTable(holders: CapHolder[]): CapTableRow[] {
  const totalShares = sum(holders.map((h) => h.shares));
  const totalVotes = sum(holders.map((h) => h.shares * h.votesPerShare));
  return holders.map((h) => ({
    ...h,
    votes: h.shares * h.votesPerShare,
    pctShares: totalShares ? h.shares / totalShares : 0,
    pctVotes: totalVotes ? (h.shares * h.votesPerShare) / totalVotes : 0,
  }));
}

/** Shares to issue so a new investor owns `targetPct` post-money. */
export function sharesForTarget(existingShares: number, targetPct: number): number {
  if (targetPct <= 0) return 0;
  if (targetPct >= 1) throw new Error('Target ownership must be below 100%');
  return (existingShares * targetPct) / (1 - targetPct);
}

/** Dilution of an existing holder after issuing `newShares`. */
export function dilute(holderShares: number, totalShares: number, newShares: number) {
  const before = totalShares ? holderShares / totalShares : 0;
  const after = totalShares + newShares ? holderShares / (totalShares + newShares) : 0;
  return { before, after, dilution: before - after };
}

export interface WaterfallInput {
  /** Total proceeds available to equity at exit. */
  proceeds: number;
  /** Preferred capital (liquidation preference base). */
  prefCapital: number;
  prefRate: number;
  years: number;
  cumulative: boolean;
  /** Preferred dividends already paid during the holding period. */
  prefPaid: number;
  participating: boolean;
  /** Economic % of the preferred holder in the residual (if participating or as-converted). */
  residualPct: number;
}

export interface WaterfallResult {
  toPreferred: number;
  toCommon: number;
  accruedPref: number;
  steps: { label: string; amount: number }[];
}

/**
 * Two-tier distribution waterfall: (1) return of preferred capital + unpaid accrued preferred return,
 * (2) residual split pro rata (participating) or preferred takes the greater of preference and as-converted.
 */
export function waterfall(w: WaterfallInput): WaterfallResult {
  const accrued = w.cumulative ? Math.max(0, w.prefCapital * (Math.pow(1 + w.prefRate, w.years) - 1) - w.prefPaid) : 0;
  const preference = w.prefCapital + accrued;
  const steps: { label: string; amount: number }[] = [];
  if (w.participating) {
    const tier1 = Math.min(w.proceeds, preference);
    const residual = Math.max(0, w.proceeds - tier1);
    const pShare = residual * w.residualPct;
    steps.push({ label: 'Return of preferred capital and accrued return', amount: tier1 });
    steps.push({ label: 'Preferred share of residual (participating)', amount: pShare });
    steps.push({ label: 'Common share of residual', amount: residual - pShare });
    return { toPreferred: tier1 + pShare, toCommon: residual - pShare, accruedPref: accrued, steps };
  }
  const asConverted = w.proceeds * w.residualPct;
  const pref = Math.min(w.proceeds, preference);
  if (asConverted > pref) {
    steps.push({ label: 'Preferred converts (as-converted value exceeds preference)', amount: asConverted });
    steps.push({ label: 'Common share', amount: w.proceeds - asConverted });
    return { toPreferred: asConverted, toCommon: w.proceeds - asConverted, accruedPref: accrued, steps };
  }
  steps.push({ label: 'Preferred liquidation preference', amount: pref });
  steps.push({ label: 'Common residual', amount: w.proceeds - pref });
  return { toPreferred: pref, toCommon: w.proceeds - pref, accruedPref: accrued, steps };
}

/** Distribute an annual amount across months by weights (normalised). */
export function spreadMonthly(amount: number, weights: number[]): number[] {
  const tot = sum(weights);
  if (!tot) return weights.map(() => 0);
  return weights.map((w) => (amount * w) / tot);
}

/** Months leading up to an event: cost ramp weights (1..12), peaking in the event month. */
export function costRamp(eventMonth: number): number[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    if (m > eventMonth) return m === eventMonth + 1 ? 0.5 : 0.1; // settlement and wind-down
    const dist = eventMonth - m;
    return dist === 0 ? 4 : dist <= 2 ? 2 : dist <= 5 ? 1 : 0.4;
  });
}
