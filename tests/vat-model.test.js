import test from 'node:test';
import assert from 'node:assert/strict';
import { missionAmounts, summarizeVat } from '../vat-model.js';
import { summarizeMissions } from '../fiscal-model.js';

const now = new Date(2026, 8, 28);
const paid = (price, date_payment = '2026-09-01', other = {}) => ({ price, date_payment, status: 'payee', vat_rate: 20, ...other });

test('Historical missions stay tax-free; taxable quote retains HT and adds VAT', () => {
  assert.deepEqual(missionAmounts({ price: 1000 }), { net: 100000, vat: 0, gross: 100000, rate: 0 });
  assert.deepEqual(missionAmounts({ price: '1 000,00', vat_rate: '20.00', debours: 99 }), { net: 100000, vat: 20000, gross: 120000, rate: 20 });
  assert.equal(missionAmounts({ price: 0.03, vat_rate: 20 }).vat, 1);
  assert.equal(missionAmounts({ price: 512.4, vat_rate: 20 }).gross, 61488);
  for (const m of [{ price: -1 }, { price: 'bad' }, { price: 100, vat_rate: -20 }, { price: 100, vat_rate: 5 }]) assert.equal(missionAmounts(m), null);
});

test('Only full dated actual receipts count; accepted quotes stay pending and sent quotes do not count', () => {
  const result = summarizeVat([paid(1000), paid(999, '2025-12-31'), paid(80, '2026-09-28', { vat_rate: 0 }),
    { price: 200, vat_rate: 20, status: 'terminee', quote_accepted: true },
    { price: 900, vat_rate: 20, status: 'en_cours', quote_sent: true }], 2026, {}, now);
  assert.equal(result.collected, 20000);
  assert.equal(result.pending, 4000);
  assert.equal(result.balance, 20000);
  assert.equal(result.payments.length, 1);
});

test('Payment dates determine the VAT year, never validation dates', () => {
  const missions = [paid(1000, '2026-01-01', { date_validation: '2025-10-01' }), paid(300, '2025-12-31')];
  assert.equal(summarizeVat(missions, 2026, {}, now).collected, 20000);
  assert.equal(summarizeVat(missions, 2025, {}, now).collected, 6000);
  assert.equal(summarizeVat([], 2026, {}, now).balance, 0);
});

test('Invalid payments and VAT rates are excluded with a visible issue', () => {
  const result = summarizeVat([paid(100, null), paid(100, '2026-02-30'), paid(100, '2026-09-29'),
    paid(100, '2026-09-01', { status: 'en_cours' }), paid(-1), paid(100, '2026-09-01', { vat_rate: 'bad' })], 2026, {}, now);
  assert.equal(result.collected, 0);
  assert.equal(result.issues.length, 6);
});

test('Balance deducts deductible VAT and remittances and preserves negative credit', () => {
  assert.equal(summarizeVat([paid(1000)], 2026, { deductible: 20, remitted: 50, opening_balance: -10 }, now).balance, 12000);
  assert.equal(summarizeVat([paid(1000)], 2026, { deductible: 250 }, now).balance, -5000);
  assert.equal(summarizeVat([], 2026, { opening_balance: 90 }, now).balance, 9000);
  assert.throws(() => summarizeVat([], 2026, { deductible: -10 }, now));
  assert.throws(() => summarizeVat([], 2026, { remitted: 'bad' }, now));
});

test('VAT does not inflate quarterly URSSAF, annual turnover or quote projections', () => {
  const data = summarizeMissions([paid(1000), { price: 500, vat_rate: 20, quote_accepted: true }], 2026, 3, {}, now);
  assert.equal(data.total, 100000);
  assert.equal(data.annual, 100000);
  assert.equal(data.committed, 50000);
});
