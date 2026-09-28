import { missionAmounts } from './vat-model.js';

export function initMissionVat() {
  const price = document.getElementById('missionPrice');
  const checkbox = document.getElementById('missionVat');
  const summary = document.getElementById('missionVatSummary');
  const money = cents => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  function refresh() {
    const amounts = missionAmounts({ price: price.value, vat_rate: checkbox.checked ? 20 : 0 });
    summary.hidden = !checkbox.checked;
    summary.textContent = amounts ? `TVA : ${money(amounts.vat)} · TTC : ${money(amounts.gross)}` : 'Montant invalide';
  }
  price.addEventListener('input', refresh);
  checkbox.addEventListener('change', refresh);
  return { refresh };
}
