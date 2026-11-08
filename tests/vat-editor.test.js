import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareVatRecord } from '../vat-editor.js';
import { summarizeMonthlyVat } from '../vat-monthly.js';
import { vatMonthForms } from '../vat-forms.js';

const now = new Date(2026, 10, 8);
const period = '2026-10-01';
const receipt = { id: 'proof', amount_cents: 1717 };
const previous = { period, user_id: 'owner', declared: true, declared_balance: 150, declared_on: '2026-11-01',
  deductible: 17.17, reverse_charge_base: 85.83, reverse_charge_due: 17.17, reverse_charge_deductible: 17.17,
  opening_credit: 10, expected_payment_date: '2026-11-18', note: 'À conserver', deduction_source: 'receipts',
  deduction_snapshot: [receipt], deduction_applied_at: '2026-11-02T12:00:00Z', deduction_needs_review: true };
const prepare = (action, values, old = previous) => prepareVatRecord(old, period, action, values, now);

test('Confirming a debit preserves the filed amount, deductions, credit, note and receipt audit trail', () => {
  const record = prepare('payment', { remitted: '150', payment_date: '2026-11-08' });
  for (const name of Object.keys(previous)) assert.deepEqual(record[name], previous[name]);
  assert.equal(record.remitted, 150);
  assert.equal(record.payment_date, '2026-11-08');
});

test('Declaration direction uses a positive input and preserves an existing debit', () => {
  const record = prepare('declaration', { declared_amount: '50', declared_kind: 'credit', declared_on: '2026-11-01' },
    { ...previous, remitted: 150, payment_date: '2026-11-03' });
  assert.equal(record.declared_balance, -50);
  assert.equal(record.remitted, 150);
  assert.deepEqual(record.deduction_snapshot, [receipt]);
  assert.throws(() => prepare('declaration', { declared_amount: '-50', declared_kind: 'credit' }), /positif/);
});

test('Optional note and date forms preserve an unknown declared balance and stale-receipt flag', () => {
  const record = prepare('note', { note: ' Nouvelle note ' }, { ...previous, declared_balance: null });
  assert.equal(record.declared_balance, null);
  assert.equal(record.note, 'Nouvelle note');
  assert.equal(record.deduction_needs_review, true);
  const scheduled = prepare('schedule', { expected_payment_date: '2026-11-20' });
  assert.equal(scheduled.declared_balance, 150);
  assert.equal(scheduled.remitted, 0);
});

test('Only a changed deduction clears its receipt snapshot; editing the old credit does not', () => {
  const unchanged = prepare('adjustments', { deductible: '17.17', reverse_charge_base: '85.83', reverse_charge_due: '17.17', reverse_charge_deductible: '17.17' });
  assert.equal(unchanged.deduction_source, 'receipts');
  const changed = prepare('adjustments', { deductible: '20', reverse_charge_base: '85.83', reverse_charge_due: '17.17', reverse_charge_deductible: '17.17' });
  assert.equal(changed.deduction_source, 'manual');
  assert.deepEqual(changed.deduction_snapshot, []);
  const credit = prepare('credit', { opening_credit: '25' });
  assert.deepEqual(credit.deduction_snapshot, [receipt]);
  assert.equal(credit.deduction_source, 'receipts');
});

test('The small forms keep date, declaration and balanced reverse-charge guards', () => {
  assert.throws(() => prepare('payment', { remitted: '150', payment_date: '2026-11-09' }), error => error.field === 'payment_date');
  assert.throws(() => prepare('payment', { remitted: '150', payment_date: '2026-11-08' }, {}), /déclaration/);
  assert.throws(() => prepareVatRecord({}, '2026-11-01', 'declaration', { declared_amount: '100', declared_kind: 'payable' }, now), /mois doit être terminé/);
  assert.throws(() => prepare('adjustments', { deductible: '10', reverse_charge_base: '85.83', reverse_charge_due: '17.17', reverse_charge_deductible: '17.17' }), /autoliquidation/);
  assert.throws(() => prepare('payment', { remitted: '0', payment_date: '2026-11-08' }), /montant nul/);
});

test('Current, closed, declared and paid months expose the appropriate primary action', () => {
  const month = record => summarizeMonthlyVat([], [record], [], now, record.period).months.find(m => m.period === record.period);
  const ongoing = vatMonthForms(month({ period: '2026-11-01' }));
  assert.equal(ongoing.workflow, '');
  assert.doesNotMatch(ongoing.advanced, /data-vat-form="declaration"|data-vat-form="payment"/);
  assert.match(vatMonthForms(month({ period })).workflow, /J’ai effectué ma déclaration/);
  const waiting = vatMonthForms(month({ period, declared: true, declared_balance: 150 }));
  assert.match(waiting.workflow, /Confirmer le débit/);
  assert.doesNotMatch(waiting.workflow, /opening_credit|reverse_charge_base|name="note"/);
  const paid = vatMonthForms(month({ period, declared: true, declared_balance: 150, remitted: 150, payment_date: '2026-11-08' }));
  assert.equal(paid.workflow, '');
  assert.match(paid.advanced, /Modifier le paiement confirmé/);
});
