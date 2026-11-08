import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReverseCharge, normalizeInvoice, deduplicateExpenses, expenseReviewState, summarizeExpenseReviews } from '../supabase/functions/_shared/vat-expenses.js';
import { summarizeMonthlyVat, validateVatRecord } from '../vat-monthly.js';

const now = new Date(2026, 10, 8);
const period = '2026-11-01';
const source = (currency = 'EUR') => deduplicateExpenses([normalizeInvoice({ id: 'example', issue_date: period,
  total_amount: { value: '100', currency }, total_tax_amount: { value: '0', currency }, attachment_id: 'proof' }, period)])[0];
const approval = (currency = 'EUR', share = 100) => {
  const row = source(currency), result = calculateReverseCharge(10000, 20, share);
  return { ...row, decision: 'approved', vat_treatment: 'reverse_charge', reverse_charge_base_cents: 10000,
    reverse_charge_rate: 20, deductible_percent: share, reverse_charge_due_cents: result.due,
    approved_cents: result.deductible, reverse_charge_region: 'non_eu', conversion_note: currency === 'EUR' ? '' : 'Cours vérifié au 01/11',
    deduction_period: period, eligible_on: period, review_fingerprint: row.source_fingerprint };
};

test('Reverse charge rounds to cents and supports full, partial or zero deduction', () => {
  assert.deepEqual(calculateReverseCharge(8583, 20, 100), { base: 8583, due: 1717, deductible: 1717, net: 0 });
  assert.deepEqual(calculateReverseCharge(10000, 20, 50), { base: 10000, due: 2000, deductible: 1000, net: 1000 });
  assert.deepEqual(calculateReverseCharge(10000, 20, 0), { base: 10000, due: 2000, deductible: 0, net: 2000 });
  assert.equal(calculateReverseCharge(100, 5.5, 50).due, 6);
  for (const args of [[0,20,100], [10000,0,100], [10000,20,101], [10000,20,-1], [10000,20,12.345], [NaN,20,100]]) {
    assert.equal(calculateReverseCharge(...args), null);
  }
});

test('A zero-tax supplier invoice remains visible for reverse-charge review', () => {
  const total = summarizeExpenseReviews([source()], period);
  assert.equal(total.pending, 1);
  assert.equal(total.amount, 0);
});

test('Reverse charge adds due and deductible separately without creating a tax credit', () => {
  const row = approval();
  const total = summarizeExpenseReviews([row], period);
  assert.equal(total.amount, 2000);
  assert.equal(total.reverseChargeDue, 2000);
  assert.equal(total.reverseChargeNonEuBase, 10000);
  assert.equal(total.reverseChargeEuBase, 0);
  const month = summarizeMonthlyVat([], [{ period, deductible: 20, reverse_charge_base: 100,
    reverse_charge_due: 20, reverse_charge_deductible: 20 }], [], now).months.at(-1);
  assert.equal(month.collected, 0);
  assert.equal(month.net, 0);
  assert.equal(month.credit, 0);
});

test('Non-deductible reverse charge enters the cash reserve and does not depend on the viewed month', () => {
  const row = approval('EUR', 0);
  assert.equal(expenseReviewState(row), 'approved');
  assert.equal(summarizeExpenseReviews([row], period).reverseChargeDue, 2000);
  const summary = summarizeMonthlyVat([], [{ period, reverse_charge_base: 100, reverse_charge_due: 20 }], [], now, '2026-10-01');
  assert.equal(summary.reserve, 2000);
});

test('Foreign invoices need a validated euro base, conversion and coherent review', () => {
  const row = approval('USD');
  assert.equal(expenseReviewState(row), 'approved');
  for (const change of [{ conversion_note: '' }, { reverse_charge_base_cents: null }, { reverse_charge_region: null },
    { reverse_charge_due_cents: 1000 }, { approved_cents: 1000 }, { eligible_on: '2026-10-01' },
    { vat_cents: 200 }, { source_missing: true }, { review_fingerprint: 'stale' }]) {
    const invalid = { ...row, ...change };
    assert.equal(summarizeExpenseReviews([invalid], period).reverseChargeDue, 0);
  }
});

test('A matched bank debit is never added to a reverse-charge invoice twice', () => {
  const row = approval();
  const bank = { ...row, kind: 'transaction', source_key: 'transaction:example', auto_duplicate_of: row.source_key };
  assert.equal(summarizeExpenseReviews([row, bank], period).reverseChargeDue, 2000);
});

test('Monthly input rejects a deductible reverse charge missing its corresponding tax due', () => {
  assert.throws(() => validateVatRecord({ period, deductible: 20, reverse_charge_deductible: 20 }, now), /autoliquidation/);
  assert.throws(() => validateVatRecord({ period, deductible: 10, reverse_charge_base: 100,
    reverse_charge_due: 20, reverse_charge_deductible: 20 }, now), /autoliquidation/);
});

test('Monthly reverse charge and normal deductions combine while declared balances remain fixed', () => {
  const records = [{ period: '2026-10-01', declared: true, declared_balance: 50,
    deductible: 10, reverse_charge_base: 100, reverse_charge_due: 20, reverse_charge_deductible: 10 },
    { period, deductible: 25, reverse_charge_base: 100, reverse_charge_due: 20, reverse_charge_deductible: 20 }];
  const summary = summarizeMonthlyVat([], records, [], now);
  assert.equal(summary.months.find(m => m.period === '2026-10-01').payable, 5000);
  assert.equal(summary.months.at(-1).credit, 500);
  assert.equal(summary.reserve, 5000);
});
