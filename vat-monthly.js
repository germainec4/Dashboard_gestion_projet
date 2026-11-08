import { cents, day } from './fiscal-model.js';
import { missionAmounts } from './vat-model.js';

export function vatPeriod(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export function defaultVatPeriod(now = new Date()) {
  return vatPeriod(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

function amount(value, label, signed = false) {
  const result = cents(value ?? 0);
  if (result === null || (!signed && result < 0)) throw new Error(`${label} invalide.`);
  return result;
}

export function validateVatRecord(record, now = new Date()) {
  const period = day(record.period);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!period || period.getDate() !== 1 || period.getFullYear() < 2000 || period.getFullYear() > 2200 || period > today) {
    throw new Error('Mois TVA invalide.');
  }
  const deductible = amount(record.deductible, 'TVA déductible');
  const remitted = amount(record.remitted, 'Versement');
  const openingCredit = amount(record.opening_credit, 'Crédit initial');
  const declaredBalance = record.declared_balance == null || record.declared_balance === ''
    ? null : amount(record.declared_balance, 'Solde déclaré', true);
  const declared = record.declared === true;
  const closed = record.period < vatPeriod(now);
  if (declared && !closed) throw new Error('Le mois doit être terminé avant de confirmer sa déclaration.');
  if (!declared && (declaredBalance !== null || record.declared_on || remitted > 0 || record.payment_date || record.expected_payment_date)) {
    throw new Error('Confirme la déclaration avant de renseigner son solde ou son paiement.');
  }
  for (const name of ['declared_on', 'payment_date', 'expected_payment_date']) {
    if (!record[name]) continue;
    const date = day(record[name]);
    if (!date || date < new Date(period.getFullYear(), period.getMonth() + 1, 1) || (name !== 'expected_payment_date' && date > today)) {
      throw new Error('La date doit être valide et postérieure au mois déclaré ; une date effective ne peut pas être future.');
    }
  }
  if ((remitted > 0) !== Boolean(record.payment_date)) throw new Error('Renseigne ensemble le montant réellement payé et sa date de débit.');
  if (record.declared_on && record.payment_date && record.payment_date < record.declared_on) throw new Error('Le paiement ne peut pas précéder la déclaration.');
  return { deductible, remitted, openingCredit, declaredBalance, declared };
}

export function vatStatus(month) {
  if (month.provisional) return { label: 'Provisoire', style: 'upcoming' };
  if (!month.declared) return { label: 'À préparer', style: '' };
  if (month.credit > 0) return { label: 'Déclarée · crédit à reporter', style: 'open' };
  if (!month.payable) return { label: 'Déclarée · sans paiement', style: 'open' };
  if (!month.remaining) return { label: 'Payée', style: 'open' };
  return { label: month.expected_payment_date ? 'Déclarée · prélèvement en attente' : 'Déclarée · paiement en attente', style: 'upcoming' };
}

// Build one chronological ledger, including December/January. Payments settle only
// their own declaration; a credit cannot cancel a debt from an earlier month.
export function summarizeMonthlyVat(missions, records = [], legacy = [], now = new Date(), selectedPeriod = defaultVatPeriod(now)) {
  const currentPeriod = vatPeriod(now);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const buckets = new Map();
  const issues = [];
  const saved = new Map();
  validateVatRecord({ period: selectedPeriod }, now);
  const candidates = [defaultVatPeriod(now), selectedPeriod];
  for (const record of records) {
    validateVatRecord(record, now);
    if (saved.has(record.period)) throw new Error('Mois TVA enregistré en double.');
    saved.set(record.period, record);
    candidates.push(record.period);
  }
  for (const mission of missions) {
    if (Number(mission.vat_rate ?? 0) === 0) continue;
    const amounts = missionAmounts(mission);
    const payment = day(mission.date_payment);
    let reason = '';
    if (!amounts) reason = 'Montant ou taux TVA invalide';
    else if (mission.status === 'payee' && !payment) reason = 'Date de paiement manquante ou invalide';
    else if (mission.status !== 'payee' && mission.date_payment) reason = 'Date présente mais statut non payé';
    else if (payment && payment > today) reason = 'Date de paiement future';
    if (reason) { issues.push({ mission, reason }); continue; }
    if (mission.status !== 'payee') continue;
    const period = vatPeriod(payment);
    candidates.push(period);
    if (!buckets.has(period)) buckets.set(period, []);
    buckets.get(period).push({ mission, payment, ...amounts });
  }
  const unreconciled = legacy.filter(row => !row.monthly_reconciled && ['deductible', 'remitted', 'opening_balance'].some(key => amount(row[key], key, true) !== 0));
  const months = [];
  let credit = 0;
  const first = day(candidates.sort()[0]);
  // Fill whole years so any historical month can be selected, including zero returns.
  const cursor = new Date(first.getFullYear(), 0, 1);
  while (vatPeriod(cursor) <= currentPeriod) {
    const period = vatPeriod(cursor);
    const record = saved.get(period) || { period };
    const values = validateVatRecord(record, now);
    const payments = (buckets.get(period) || []).sort((a, b) => b.payment - a.payment);
    const collected = payments.reduce((total, payment) => total + payment.vat, 0);
    const computedNet = collected - values.deductible - values.openingCredit - credit;
    const net = values.declaredBalance ?? computedNet;
    const payable = Math.max(0, net);
    const month = { ...record, ...values, period, collected, payments, carriedCredit: credit,
      computedNet, net, payable, credit: Math.max(0, -net), remaining: Math.max(0, payable - values.remitted),
      overpaid: Math.max(0, values.remitted - payable), provisional: period === currentPeriod,
      estimated: values.declaredBalance === null };
    month.status = vatStatus(month);
    months.push(month);
    credit = month.credit;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return { months, issues, unreconciled,
    reserve: issues.length || unreconciled.length ? null : months.reduce((total, month) => total + month.remaining, 0) };
}
