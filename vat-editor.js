import { cents, day } from './fiscal-model.js';
import { validateVatRecord } from './vat-monthly.js';

const numericFields = ['deductible', 'reverse_charge_base', 'reverse_charge_due', 'reverse_charge_deductible', 'opening_credit', 'remitted'];
const dateFields = ['declared_on', 'payment_date', 'expected_payment_date'];
const deductionFields = numericFields.slice(0, 4);

function invalid(message, field) {
  throw Object.assign(new Error(message), { field });
}

// Each small form changes only its own fields. In particular, confirming a debit
// must not replace a declared balance or erase a receipt snapshot.
export function prepareVatRecord(previous, period, action, values, now = new Date()) {
  const record = { user_id: previous.user_id, period,
    declared: previous.declared === true, declared_balance: previous.declared_balance ?? null,
    note: previous.note || '', deduction_source: previous.deduction_source || 'manual',
    deduction_snapshot: previous.deduction_snapshot || [], deduction_applied_at: previous.deduction_applied_at || null,
    deduction_needs_review: previous.deduction_needs_review || false };
  numericFields.forEach(name => { record[name] = previous[name] ?? 0; });
  dateFields.forEach(name => { record[name] = previous[name] || null; });
  const amount = (name, label) => {
    const result = cents(values[name]);
    if (values[name] == null || String(values[name]).trim() === '' || result === null || result < 0) invalid(`${label} : renseigne un montant positif ou nul.`, name);
    return result / 100;
  };
  if (action === 'declaration') {
    if (!['payable', 'credit'].includes(values.declared_kind)) invalid('Choisis « À payer » ou « Crédit à reporter ».', 'declared_kind');
    record.declared = true;
    record.declared_balance = amount('declared_amount', 'Montant déclaré') * (values.declared_kind === 'credit' ? -1 : 1);
    record.declared_on = values.declared_on || null;
  } else if (action === 'payment') {
    if (!record.declared) invalid('Enregistre la déclaration avant de confirmer le débit.', 'remitted');
    record.remitted = amount('remitted', 'Montant débité');
    record.payment_date = values.payment_date || null;
    if (record.remitted > 0 && !record.payment_date) invalid('Renseigne la date du débit constaté sur Qonto.', 'payment_date');
    if (record.remitted === 0 && record.payment_date) invalid('Un montant nul ne peut pas avoir de date de débit.', 'payment_date');
  } else if (action === 'schedule') {
    record.expected_payment_date = values.expected_payment_date || null;
  } else if (action === 'adjustments') {
    deductionFields.forEach(name => { record[name] = amount(name, 'Montant de TVA'); });
  } else if (action === 'credit') {
    record.opening_credit = amount('opening_credit', 'Ancien crédit à reprendre');
  } else if (action === 'note') {
    record.note = String(values.note || '').trim();
  } else invalid('Action inconnue. Actualise le suivi TVA.');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const name of dateFields) {
    if (!record[name]) continue;
    const date = day(record[name]);
    const start = day(period);
    if (!date || date < new Date(start.getFullYear(), start.getMonth() + 1, 1) || (name !== 'expected_payment_date' && date > today)) {
      invalid('Choisis une date après le mois concerné ; une date effective ne peut pas être future.', name);
    }
  }
  if (record.declared_on && record.payment_date && record.payment_date < record.declared_on) invalid('Le débit ne peut pas précéder la déclaration.', 'payment_date');
  validateVatRecord(record, now);
  if (deductionFields.some(name => cents(record[name]) !== cents(previous[name] ?? 0))) {
    Object.assign(record, { deduction_source: 'manual', deduction_snapshot: [], deduction_applied_at: null, deduction_needs_review: false });
  }
  return record;
}
