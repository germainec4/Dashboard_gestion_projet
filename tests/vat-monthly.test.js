import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultVatPeriod, summarizeMonthlyVat, validateVatRecord } from '../vat-monthly.js';

const now = new Date(2026, 10, 8);
const paid = (price, date, other = {}) => ({ title: 'Mission', price, vat_rate: 20, status: 'payee', date_payment: date, ...other });
const row = (period, other = {}) => ({ period, ...other });
const month = (data, period) => data.months.find(item => item.period === period);

test('Default VAT period is last month, including December in January', () => {
  assert.equal(defaultVatPeriod(now), '2026-10-01');
  assert.equal(defaultVatPeriod(new Date(2027, 0, 1)), '2026-12-01');
});

test('Receipts belong to their payment month, with cent rounding and no unpaid or VAT-free missions', () => {
  const data = summarizeMonthlyVat([paid(1000, '2026-10-31'), paid(500, '2026-11-01'), paid(0.03, '2026-10-01'),
    paid(100, '2026-10-01', { vat_rate: 0 }), paid(900, null, { status: 'terminee', quote_accepted: true })], [], [], now);
  assert.equal(month(data, '2026-10-01').collected, 20001);
  assert.equal(month(data, '2026-11-01').collected, 10000);
  assert.equal(month(data, '2026-11-01').status.label, 'Provisoire');
  assert.equal(data.reserve, 30001);
});

test('Declared October awaiting a November debit stays reserved; the debit settles only October', () => {
  const missions = [paid(1000, '2026-10-05'), paid(500, '2026-11-05')];
  const record = row('2026-10-01', { deductible: 50, declared: true, declared_balance: 150, expected_payment_date: '2026-11-18' });
  let data = summarizeMonthlyVat(missions, [record], [], now);
  assert.equal(month(data, record.period).status.label, 'Déclarée · prélèvement en attente');
  assert.equal(data.reserve, 25000);
  data = summarizeMonthlyVat(missions, [{ ...record, remitted: 150, payment_date: '2026-11-08' }], [], now);
  assert.equal(month(data, record.period).status.label, 'Payée');
  assert.equal(data.reserve, 10000);
  assert.equal(month(data, '2026-11-01').remitted, 0);
});

test('Unknown filed amounts stay estimated; a saved actual declaration survives mission corrections', () => {
  const record = row('2026-10-01', { declared: true });
  let data = summarizeMonthlyVat([paid(1000, '2026-10-05')], [record], [], now);
  assert.equal(month(data, record.period).estimated, true);
  data = summarizeMonthlyVat([paid(1200, '2026-10-05')], [{ ...record, declared_balance: 200 }], [], now);
  assert.equal(month(data, record.period).computedNet, 24000);
  assert.equal(month(data, record.period).net, 20000);
  assert.equal(data.reserve, 20000);
});

test('Credit carries over empty months and years without cancelling unpaid earlier declarations', () => {
  const data = summarizeMonthlyVat([paid(1000, '2025-10-05'), paid(500, '2026-01-03')],
    [row('2025-11-01', { deductible: 150, declared: true, declared_balance: -150 })], [], now);
  assert.equal(month(data, '2025-12-01').credit, 15000);
  assert.equal(month(data, '2026-01-01').carriedCredit, 15000);
  assert.equal(month(data, '2026-01-01').credit, 5000);
  assert.equal(month(data, '2026-11-01').credit, 5000);
  assert.equal(data.reserve, 20000);
});

test('An opening credit is applied once and overpayments are not invented as VAT credits', () => {
  const data = summarizeMonthlyVat([paid(1000, '2026-09-05'), paid(1000, '2026-10-05')],
    [row('2026-09-01', { declared: true, opening_credit: 50, remitted: 160, payment_date: '2026-10-10' })], [], now);
  assert.equal(month(data, '2026-09-01').overpaid, 1000);
  assert.equal(month(data, '2026-10-01').carriedCredit, 0);
  assert.equal(data.reserve, 20000);
});

test('Unreconciled annual adjustments and invalid receipts block the cash estimate', () => {
  const legacy = [{ year: 2025, deductible: 100, remitted: 50, opening_balance: -20 }];
  assert.equal(summarizeMonthlyVat([], [], legacy, now).reserve, null);
  assert.equal(summarizeMonthlyVat([], [], [{ ...legacy[0], monthly_reconciled: true }], now).reserve, 0);
  assert.equal(summarizeMonthlyVat([], [], [{ year: 2025, deductible: 0 }], now).reserve, 0);
  const data = summarizeMonthlyVat([paid(100, null), paid(100, '2026-11-09'), paid(100, '2026-02-30')], [], [], now);
  assert.equal(data.issues.length, 3);
  assert.equal(data.reserve, null);
});

test('Validate real debit dates, completed months and declaration/payment consistency', () => {
  for (const invalid of [
    row('2026-10-02'), row('2026-12-01'), row('2026-10-01', { deductible: -1 }),
    row('2026-10-01', { declared_balance: 100 }), row('2026-11-01', { declared: true }),
    row('2026-10-01', { declared: true, remitted: 10 }),
    row('2026-10-01', { declared: true, payment_date: '2026-11-01' }),
    row('2026-10-01', { declared: true, remitted: 10, payment_date: '2026-11-18' }),
    row('2026-10-01', { declared: true, declared_on: '2026-10-31' })
  ]) assert.throws(() => validateVatRecord(invalid, now));
  assert.doesNotThrow(() => validateVatRecord(row('2026-10-01', { declared: true, expected_payment_date: '2026-11-18' }), now));
});
