import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capTable, convert, dilute, irr, loanSchedule, moic, npv, sharesForTarget, spreadMonthly, waterfall } from '../../src/engines/finance/finance';

const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('loan amortization: bullet repayment with annual cash interest', () => {
  const s = loanSchedule(1_000_000, 2027, { rate: 0.07, termYears: 3, repayment: 'maturity', cashInterest: true }, [2027, 2028, 2029]);
  assert.deepEqual(
    s.map((x) => [x.year, Math.round(x.interest), Math.round(x.principal), Math.round(x.closing)]),
    [
      [2027, 70000, 0, 1000000],
      [2028, 70000, 0, 1000000],
      [2029, 70000, 1000000, 0],
    ],
  );
});

test('loan amortization: equal annual principal', () => {
  const s = loanSchedule(900_000, 2027, { rate: 0.1, termYears: 3, repayment: 'annual', cashInterest: true }, [2027, 2028, 2029]);
  assert.deepEqual(s.map((x) => Math.round(x.principal)), [300000, 300000, 300000]);
  assert.deepEqual(s.map((x) => Math.round(x.interest)), [90000, 60000, 30000]);
  assert.equal(s[2].closing, 0);
});

test('loan amortization: capitalised (PIK) interest is repaid at maturity', () => {
  const s = loanSchedule(100_000, 2027, { rate: 0.1, termYears: 2, repayment: 'maturity', cashInterest: false }, [2027, 2028]);
  close(s[0].interestAccrued, 10_000);
  close(s[1].interestAccrued, 11_000);
  close(s[1].principal, 121_000);
  assert.equal(s[0].interestPaid, 0);
});

test('loan amortization: rejects invalid input', () => {
  assert.throws(() => loanSchedule(-1, 2027, { rate: 0.05, termYears: 3, repayment: 'annual', cashInterest: true }, [2027]));
  assert.throws(() => loanSchedule(1, 2027, { rate: 0.05, termYears: 0, repayment: 'annual', cashInterest: true }, [2027]));
});

test('IRR matches a known value and NPV is zero at the IRR', () => {
  const flows = [-1000, 300, 400, 500];
  const r = irr(flows)!;
  close(r, 0.0889633947, 1e-8);
  close(npv(r, flows), 0, 1e-6);
});

test('IRR is undefined without a sign change', () => {
  assert.equal(irr([-100, -50]), null);
  assert.equal(irr([100, 50]), null);
});

test('MOIC', () => {
  assert.equal(moic([-100, 50, 150]), 2);
  assert.equal(moic([10, 20]), null);
});

test('currency conversion both ways and rejects bad FX', () => {
  assert.equal(convert(100, 'USD', 'CAD', 1.35), 135);
  close(convert(135, 'CAD', 'USD', 1.35), 100);
  assert.equal(convert(5, 'CAD', 'CAD', 1.35), 5);
  assert.throws(() => convert(1, 'USD', 'CAD', 0));
});

test('cap table percentages and votes', () => {
  const t = capTable([
    { holderId: 'a', shares: 70, votesPerShare: 1, classLabel: 'A' },
    { holderId: 'b', shares: 30, votesPerShare: 0, classLabel: 'B' },
  ]);
  assert.equal(t[0].pctShares, 0.7);
  assert.equal(t[0].pctVotes, 1);
  assert.equal(t[1].pctVotes, 0);
});

test('share dilution and target issuance', () => {
  const n = sharesForTarget(100, 0.4);
  close(n, 66.6666667, 1e-6);
  const d = dilute(100, 100, n);
  close(d.after, 0.6, 1e-9);
  close(d.dilution, 0.4, 1e-9);
  assert.throws(() => sharesForTarget(100, 1));
});

test('preferred distribution waterfall: preference vs conversion', () => {
  const w = waterfall({ proceeds: 1_000_000, prefCapital: 500_000, prefRate: 0.08, years: 2, cumulative: true, prefPaid: 0, participating: false, residualPct: 0.3 });
  close(w.accruedPref, 500_000 * (1.08 ** 2 - 1));
  close(w.toPreferred, 583_200);
  const conv = waterfall({ proceeds: 5_000_000, prefCapital: 500_000, prefRate: 0.08, years: 2, cumulative: true, prefPaid: 0, participating: false, residualPct: 0.3 });
  close(conv.toPreferred, 1_500_000);
  const part = waterfall({ proceeds: 1_000_000, prefCapital: 500_000, prefRate: 0, years: 1, cumulative: false, prefPaid: 0, participating: true, residualPct: 0.5 });
  close(part.toPreferred, 750_000);
  close(part.toPreferred + part.toCommon, 1_000_000);
});

test('monthly spreading sums to the annual amount', () => {
  const m = spreadMonthly(1200, [1, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  close(m.reduce((a, b) => a + b, 0), 1200);
  assert.equal(m[2], 600);
});
