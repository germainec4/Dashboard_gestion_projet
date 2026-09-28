import { cents, day } from './fiscal-model.js';
import { missionAmounts } from './supabase/functions/_shared/mission-amounts.js';
export { missionAmounts };

// Full payments only; quote acceptance never constitutes collection.
export function summarizeVat(missions, year, adjustments = {}, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const result = { collected: 0, pending: 0, payments: [], issues: [] };
  for (const mission of missions) {
    if (Number(mission.vat_rate ?? 0) === 0) continue;
    const amounts = missionAmounts(mission);
    const payment = day(mission.date_payment);
    let reason = '';
    if (!amounts) reason = 'Montant ou taux TVA invalide';
    else if (mission.status === 'payee' && !payment) reason = 'Date de paiement manquante ou invalide';
    else if (mission.status !== 'payee' && mission.date_payment) reason = 'Date présente mais statut non payé';
    else if (payment && payment > today) reason = 'Date de paiement future';
    if (reason) { result.issues.push({ mission, reason }); continue; }
    if (mission.status === 'payee' && payment.getFullYear() === year) {
      result.collected += amounts.vat;
      result.payments.push({ mission, payment, ...amounts });
    } else if (mission.status !== 'payee' && mission.quote_accepted) {
      result.pending += amounts.vat;
    }
  }
  const deductible = cents(adjustments.deductible ?? 0);
  const remitted = cents(adjustments.remitted ?? 0);
  const opening = cents(adjustments.opening_balance ?? 0);
  if (deductible === null || deductible < 0 || remitted === null || remitted < 0 || opening === null) {
    throw new Error('Ajustements TVA invalides');
  }
  result.payments.sort((a, b) => b.payment - a.payment);
  return { ...result, deductible, remitted, opening,
    balance: result.collected + opening - deductible - remitted };
}
