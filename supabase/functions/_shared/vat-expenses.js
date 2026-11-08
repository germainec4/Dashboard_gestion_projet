// Shared between the Qonto importer, the browser and Node tests. Amounts are cents.
export function expenseCents(value) {
  const input = value && typeof value === 'object' ? value.value : value;
  if (input === null || input === undefined || input === '') return null;
  const number = Number(String(input).replace(/\s/g, '').replace(',', '.'));
  const result = Math.round(number * 100);
  return Number.isSafeInteger(result) ? result : null;
}

export function expenseDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function parisDay(value) {
  if (expenseDay(value)) return value;
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(+date)) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export const expensePeriod = value => expenseDay(value) ? `${value.slice(0, 7)}-01` : null;
const words = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const personWords = value => words(value).split(' ').filter(word => word && !['ei', 'sa', 'sas', 'sasu', 'sarl', 'eurl'].includes(word)).sort().join(' ');
// Keep the readable display attachment first (e-invoices may also have an XML original).
const ids = values => [...new Set(values.filter(value => typeof value === 'string' && value.length > 0))];

export function expenseFingerprint(row) {
  return JSON.stringify([row.kind, row.source_id, row.supplier, row.reference, row.source_date, row.payment_date,
    row.proposed_period, row.amount_cents, row.currency, row.vat_cents, [...row.attachment_ids].sort(),
    row.document_key, row.credit_note, row.blocked_reason, row.auto_duplicate_of, row.provider_duplicate]);
}

export function normalizeInvoice(invoice, fallbackPeriod) {
  const amount = expenseCents(invoice.total_amount);
  const directTax = expenseCents(invoice.total_tax_amount);
  const taxItems = (invoice.taxes || []).map(tax => expenseCents(tax.tax_amount));
  const vat = directTax ?? (taxItems.length && taxItems.every(item => item !== null) ? taxItems.reduce((a, b) => a + b, 0) : null);
  const sourceDate = expenseDay(invoice.issue_date);
  const paymentDate = expenseDay(invoice.payment_date);
  const attachments = ids([invoice.display_attachment_id, invoice.attachment_id]);
  const currency = invoice.total_amount?.currency || 'EUR';
  const supplier = String(invoice.supplier_name || invoice.issuer_name || 'Fournisseur à préciser').slice(0, 300);
  const reference = String(invoice.invoice_number || '').slice(0, 300);
  const taxId = invoice.vat_number || invoice.supplier_snapshot?.vat_number || invoice.supplier_name || supplier;
  return {
    source_key: `invoice:${invoice.id}`, kind: 'invoice', source_id: invoice.id, supplier, reference,
    source_date: sourceDate, payment_date: paymentDate,
    proposed_period: expensePeriod(paymentDate || sourceDate || fallbackPeriod),
    amount_cents: Math.abs(amount ?? 0), currency, vat_cents: vat === null ? null : Math.abs(vat),
    attachment_ids: attachments, file_name: String(invoice.file_name || '').slice(0, 300),
    document_key: reference ? `number:${words(taxId)}:${words(reference)}` : attachments[0] ? `attachment:${attachments[0]}` : `invoice:${invoice.id}`,
    credit_note: Boolean(invoice.is_credit_note || (amount ?? 0) < 0), provider_duplicate: Boolean(invoice.has_duplicates),
    blocked_reason: amount === null ? 'Montant incomplet' : currency !== 'EUR' ? 'Devise étrangère · traitement manuel' : invoice.attachment_category === 'OTHER_NON_FINANCIAL_DOCUMENT' ? 'Document non financier' : null,
    auto_duplicate_of: null, source_missing: false
  };
}

export function normalizeTransaction(transaction, organizationName = '') {
  const date = parisDay(transaction.settled_at);
  if (transaction.side !== 'debit' || transaction.status !== 'completed' || !date) return null;
  const amount = expenseCents(transaction.amount);
  const items = transaction.vat_details?.items || [];
  const itemAmounts = items.map(item => Number.isSafeInteger(item.amount_cents) ? item.amount_cents : expenseCents(item.amount));
  const vat = items.length && itemAmounts.every(item => item !== null) ? itemAmounts.reduce((a, b) => a + b, 0) : expenseCents(transaction.vat_amount);
  const supplier = String(transaction.clean_counterparty_name || transaction.label || 'Dépense').slice(0, 300);
  const attachments = ids([...(transaction.attachment_ids || []), ...(transaction.attachments || []).map(item => item.id)]);
  const ownTransfer = /transfer/.test(transaction.operation_type || '') && personWords(supplier).split(' ').length > 1 && personWords(supplier) === personWords(organizationName);
  const nonExpense = ownTransfer || /^(urssaf|dgfip|direction generale des finances)/.test(words(supplier));
  const currency = transaction.currency || 'EUR';
  const sourceId = transaction.transaction_id || transaction.id;
  return {
    source_key: `transaction:${sourceId}`, kind: 'transaction', source_id: sourceId, supplier,
    reference: String(transaction.reference || '').slice(0, 300), source_date: date, payment_date: date,
    proposed_period: expensePeriod(date), amount_cents: Math.abs(amount ?? 0), currency,
    vat_cents: vat === null ? null : Math.abs(vat), attachment_ids: attachments, file_name: '',
    document_key: attachments[0] ? `attachment:${attachments[0]}` : `transaction:${sourceId}`,
    credit_note: false, provider_duplicate: false, auto_duplicate_of: null, source_missing: false,
    blocked_reason: nonExpense ? 'Prélèvement fiscal ou virement personnel' : amount === null ? 'Montant incomplet' : currency !== 'EUR' || (transaction.local_currency && transaction.local_currency !== 'EUR') ? 'Devise étrangère · traitement manuel' : null
  };
}

// A bank transaction may pay several invoices. Never merge those invoices together.
export function deduplicateExpenses(rows) {
  const result = rows.map(row => ({ ...row, auto_duplicate_of: null }));
  const documents = new Map();
  const attachments = new Map();
  for (const row of result.filter(row => row.kind === 'invoice' && !row.source_missing).sort((a, b) => a.source_key.localeCompare(b.source_key))) {
    const duplicate = documents.get(row.document_key) || row.attachment_ids.map(id => attachments.get(id)).find(Boolean);
    if (duplicate) row.auto_duplicate_of = duplicate;
    const canonical = duplicate || row.source_key;
    documents.set(row.document_key, canonical);
    row.attachment_ids.forEach(id => attachments.set(id, canonical));
  }
  for (const row of result.filter(row => row.kind === 'transaction' && !row.source_missing).sort((a, b) => a.source_key.localeCompare(b.source_key))) {
    const duplicate = row.attachment_ids.map(id => attachments.get(id)).find(Boolean);
    if (duplicate) row.auto_duplicate_of = duplicate;
    else row.attachment_ids.forEach(id => attachments.set(id, row.source_key));
  }
  return result.map(row => ({ ...row, source_fingerprint: expenseFingerprint(row) }));
}

export function expenseReviewState(row) {
  if (row.auto_duplicate_of || row.duplicate_of) return 'duplicate';
  if (row.decision === 'excluded') return 'excluded';
  if (row.source_missing) return 'changed';
  if (row.decision === 'approved') return row.review_fingerprint === row.source_fingerprint && row.attachment_ids?.length
    && !row.credit_note && (row.vat_treatment === 'reverse_charge' ? validReverseChargeReview(row)
      : !row.blocked_reason && row.currency === 'EUR' && row.approved_cents > 0 && row.approved_cents <= row.amount_cents)
    ? 'approved' : 'changed';
  if (row.blocked_reason || row.credit_note) return 'manual';
  if (!row.attachment_ids?.length) return 'missing';
  if (row.vat_cents === 0) return 'zero';
  return 'pending';
}

export function summarizeExpenseReviews(rows, period) {
  const relevant = rows.filter(row => row.deduction_period ? row.deduction_period === period : row.proposed_period === period);
  const totals = { approved: 0, pending: 0, missing: 0, duplicates: 0, amount: 0,
    reverseChargeBase: 0, reverseChargeDue: 0, reverseChargeDeductible: 0, reverseChargeEuBase: 0, reverseChargeNonEuBase: 0, rows: relevant };
  for (const row of relevant) {
    const state = expenseReviewState(row);
    if (state === 'approved') {
      totals.approved++; totals.amount += Number(row.approved_cents || 0);
      if (row.vat_treatment === 'reverse_charge') {
        totals.reverseChargeBase += Number(row.reverse_charge_base_cents);
        totals.reverseChargeDue += Number(row.reverse_charge_due_cents);
        totals.reverseChargeDeductible += Number(row.approved_cents);
        totals[row.reverse_charge_region === 'eu' ? 'reverseChargeEuBase' : 'reverseChargeNonEuBase'] += Number(row.reverse_charge_base_cents);
      }
    }
    else if (state === 'missing') totals.missing++;
    else if (state === 'duplicate') totals.duplicates++;
    else if (['pending', 'changed', 'manual', 'zero'].includes(state) && !(row.blocked_reason || '').includes('Prélèvement fiscal')) totals.pending++;
  }
  return totals;
}

export function calculateReverseCharge(baseCents, rate = 20, deductiblePercent = 100) {
  const rateNumber = Number(rate), share = Number(deductiblePercent);
  if (!Number.isSafeInteger(baseCents) || baseCents <= 0 || baseCents > 999999999999
    || ![2.1, 5.5, 10, 20].includes(rateNumber) || !Number.isFinite(share) || share < 0 || share > 100
    || Math.abs(share * 100 - Math.round(share * 100)) > 0.000001) return null;
  // Integer arithmetic mirrors PostgreSQL numeric rounding, including half cents.
  const due = Math.floor((baseCents * Math.round(rateNumber * 100) + 5000) / 10000);
  const deductible = Math.floor((due * Math.round(share * 100) + 5000) / 10000);
  return { base: baseCents, due, deductible, net: due - deductible };
}

export function supportsReverseCharge(row) {
  return row.kind === 'invoice' && !row.credit_note && !row.source_missing && !row.auto_duplicate_of && !row.duplicate_of
    && (!row.blocked_reason || row.blocked_reason === 'Devise étrangère · traitement manuel')
    && !(row.vat_cents > 0);
}

function validReverseChargeReview(row) {
  const result = calculateReverseCharge(Number(row.reverse_charge_base_cents), row.reverse_charge_rate, row.deductible_percent);
  return supportsReverseCharge(row) && result && ['eu', 'non_eu'].includes(row.reverse_charge_region)
    && result.due > 0 && result.due === Number(row.reverse_charge_due_cents) && result.deductible === Number(row.approved_cents)
    && (row.currency !== 'EUR' || result.base <= row.amount_cents)
    && (row.currency === 'EUR' || Boolean(row.conversion_note?.trim()))
    && expensePeriod(row.eligible_on) === row.deduction_period;
}
