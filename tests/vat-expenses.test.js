import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseCents, expenseDay, parisDay, normalizeInvoice, normalizeTransaction,
  deduplicateExpenses, expenseReviewState, summarizeExpenseReviews } from '../supabase/functions/_shared/vat-expenses.js';

const invoice = (id, extra = {}) => ({ id, supplier_name: 'Malt Community SA', invoice_number: `FACT-${id}`,
  issue_date: '2026-10-29', total_amount: { value: '12.00', currency: 'EUR' },
  total_tax_amount: { value: '2.00', currency: 'EUR' }, attachment_id: `pdf-${id}`, ...extra });
const transaction = (id, extra = {}) => ({ id, transaction_id: id, status: 'completed', side: 'debit',
  label: 'Fournisseur', settled_at: '2026-11-02T12:00:00Z', amount: 12, currency: 'EUR',
  vat_amount: 2, attachment_ids: [], ...extra });

test('Parse cents and Paris calendar days without shifting invoice dates or accepting impossible dates', () => {
  assert.equal(expenseCents('1 000,23'), 100023);
  assert.equal(expenseCents(null), null);
  assert.equal(expenseCents('bad'), null);
  assert.equal(expenseDay('2026-02-30'), null);
  assert.equal(parisDay('2026-10-31T23:30:00Z'), '2026-11-01');
  assert.equal(parisDay('2026-10-01'), '2026-10-01');
});

test('Malt fees exist as supplier invoices even without an outgoing bank transaction', () => {
  const [row] = deduplicateExpenses([normalizeInvoice(invoice('malt'), '2026-11-01')]);
  assert.equal(row.kind, 'invoice');
  assert.equal(row.vat_cents, 200);
  assert.equal(row.proposed_period, '2026-10-01');
  assert.equal(expenseReviewState(row), 'pending');
  assert.equal(summarizeExpenseReviews([row], '2026-10-01').amount, 0);
});

test('A readable PDF is opened before the XML original of an electronic invoice', () => {
  const row = normalizeInvoice(invoice('a', { attachment_id: 'a-original-xml', display_attachment_id: 'z-readable-pdf' }), '2026-11-01');
  assert.equal(row.attachment_ids[0], 'z-readable-pdf');
});

test('Invoice payment date proposes the payment month; its issue date is preserved for review', () => {
  const row = normalizeInvoice(invoice('a', { payment_date: '2026-11-02' }), '2026-11-01');
  assert.equal(row.source_date, '2026-10-29');
  assert.equal(row.proposed_period, '2026-11-01');
});

test('No guessed 20% VAT: missing amounts stay unknown and multiple rates are added in cents', () => {
  const row = normalizeInvoice(invoice('a', { total_tax_amount: null, taxes: [{ tax_amount: { value: '1.23' } }, { tax_amount: { value: '0.45' } }] }), '2026-11-01');
  assert.equal(row.vat_cents, 168);
  const unknown = normalizeTransaction(transaction('b', { vat_amount: null }));
  assert.equal(unknown.vat_cents, null);
  const split = normalizeTransaction(transaction('c', { vat_details: { items: [{ amount_cents: 123 }, { amount_cents: 45 }] } }));
  assert.equal(split.vat_cents, 168);
});

test('A bank VAT amount without a document is missing evidence, not a validated deduction', () => {
  const [row] = deduplicateExpenses([normalizeTransaction(transaction('a'))]);
  assert.equal(expenseReviewState(row), 'missing');
  assert.equal(summarizeExpenseReviews([row], '2026-11-01').missing, 1);
  assert.equal(summarizeExpenseReviews([row], '2026-11-01').amount, 0);
});

test('Invoice and bank attachments produce one candidate, not two deductions', () => {
  const rows = deduplicateExpenses([normalizeInvoice(invoice('a', { payment_date: '2026-11-02' }), '2026-11-01'),
    normalizeTransaction(transaction('a', { attachment_ids: ['pdf-a'] }))]);
  assert.equal(rows[1].auto_duplicate_of, rows[0].source_key);
  assert.equal(expenseReviewState(rows[1]), 'duplicate');
});

test('One payment covering two invoices never merges those distinct invoices', () => {
  const rows = deduplicateExpenses([normalizeInvoice(invoice('a'), '2026-11-01'), normalizeInvoice(invoice('b'), '2026-11-01'),
    normalizeTransaction(transaction('tx', { amount: 24, attachment_ids: ['pdf-a', 'pdf-b'] }))]);
  assert.equal(rows.filter(row => row.kind === 'invoice' && !row.auto_duplicate_of).length, 2);
  assert.ok(rows.find(row => row.kind === 'transaction').auto_duplicate_of);
});

test('Repeated supplier invoice numbers are deduplicated even when uploaded with different attachment ids', () => {
  const rows = deduplicateExpenses([normalizeInvoice(invoice('a', { invoice_number: 'INV-42' }), '2026-11-01'),
    normalizeInvoice(invoice('b', { invoice_number: 'INV-42' }), '2026-11-01')]);
  assert.equal(rows.filter(row => !row.auto_duplicate_of).length, 1);
});

test('Removed invoices do not hide a replacement document', () => {
  const a = { ...normalizeInvoice(invoice('a', { invoice_number: 'INV-42' }), '2026-11-01'), source_missing: true };
  const b = normalizeInvoice(invoice('b', { invoice_number: 'INV-42' }), '2026-11-01');
  const rows = deduplicateExpenses([a, b]);
  assert.equal(rows[1].auto_duplicate_of, null);
});

test('Only current human approvals count; a source change invalidates the approval', () => {
  let [row] = deduplicateExpenses([normalizeInvoice(invoice('a'), '2026-11-01')]);
  row = { ...row, decision: 'approved', approved_cents: 150, deduction_period: '2026-11-01', review_fingerprint: row.source_fingerprint };
  assert.equal(summarizeExpenseReviews([row], '2026-11-01').amount, 150);
  assert.equal(summarizeExpenseReviews([row], '2026-10-01').amount, 0);
  [row] = deduplicateExpenses([{ ...row, vat_cents: 180 }]);
  assert.equal(expenseReviewState(row), 'changed');
  assert.equal(summarizeExpenseReviews([row], '2026-11-01').amount, 0);
});

test('Credits, foreign currencies, taxes and own transfers are never offered as ordinary deductions', () => {
  assert.equal(expenseReviewState(normalizeInvoice(invoice('a', { is_credit_note: true }), '2026-11-01')), 'manual');
  assert.equal(expenseReviewState(normalizeInvoice(invoice('b', { total_amount: { value: '12', currency: 'USD' } }), '2026-11-01')), 'manual');
  const own = normalizeTransaction(transaction('c', { label: 'Clément Germaine', operation_type: 'transfer' }), 'EI - GERMAINE CLEMENT');
  assert.ok(own.blocked_reason);
  assert.equal(summarizeExpenseReviews([own], '2026-11-01').pending, 0);
  assert.ok(normalizeTransaction(transaction('d', { label: 'URSSAF' })).blocked_reason);
  assert.equal(normalizeTransaction(transaction('e', { status: 'pending' })), null);
  assert.equal(normalizeTransaction(transaction('f', { side: 'credit' })), null);
});

test('Excluded items stay excluded after disappearing, and malformed approvals never inflate the total', () => {
  const [row] = deduplicateExpenses([normalizeInvoice(invoice('a'), '2026-11-01')]);
  assert.equal(expenseReviewState({ ...row, decision: 'excluded', source_missing: true }), 'excluded');
  const invalid = { ...row, decision: 'approved', deduction_period: '2026-11-01', approved_cents: 99999, review_fingerprint: row.source_fingerprint };
  assert.equal(summarizeExpenseReviews([invalid], '2026-11-01').amount, 0);
});
