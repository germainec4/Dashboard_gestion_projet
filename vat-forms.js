const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateLabel = value => value?.split('-').reverse().join('/') || '';
const error = name => `<small class="vat-field-error" data-vat-error="${name}" role="alert" hidden></small>`;
const help = (title, text) => `<details class="vat-help"><summary>${title}</summary><p>${text}</p></details>`;
const finish = (label, external = false) => `<div class="fiscal-actions"><button class="button button-secondary" type="submit">${label}</button>${external ? '<a class="vat-text-action" href="https://www.impots.gouv.fr/" target="_blank" rel="noopener noreferrer">Espace professionnel ↗</a>' : ''}</div><p class="vat-form-feedback" data-vat-feedback role="alert"></p></form>`;
const start = action => `<form class="vat-month-form" data-vat-form="${action}">`;
const section = (id, title, content, primary = false) => `<details class="${primary ? 'vat-workflow' : 'vat-option'}" data-vat-section="${id}"><summary>${title}</summary>${content}</details>`;

export function vatMonthForms(month) {
  const nextMonth = new Date(`${month.period}T12:00:00`);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const minimum = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const number = (name, label, value) => `<label>${label}<input name="${name}" type="number" min="0" step="0.01" value="${value / 100}" required>${error(name)}</label>`;
  const declaration = () => `${start('declaration')}
    <p class="vat-hint">Après ta déclaration sur impots.gouv.fr, confirme ici le montant enregistré.</p>
    <div class="fiscal-settings-grid">
      <label>Montant déclaré (€)<input name="declared_amount" type="number" min="0" step="0.01" value="${Math.abs(month.net) / 100}" required>${month.estimated ? '<small class="vat-hint">Estimation proposée, à vérifier sur ta déclaration.</small>' : ''}${error('declared_amount')}</label>
      <label>Résultat de la déclaration<select name="declared_kind"><option value="payable" ${month.net >= 0 ? 'selected' : ''}>À payer</option><option value="credit" ${month.net < 0 ? 'selected' : ''}>Crédit à reporter</option></select>${error('declared_kind')}</label>
    </div>
    <details class="vat-option" ${month.declared_on ? 'open' : ''}><summary>${month.declared_on ? 'Date de déclaration · ' + dateLabel(month.declared_on) : 'Ajouter la date de déclaration · facultatif'}</summary>
      <label>Date de déclaration<input name="declared_on" type="date" min="${minimum}" max="${today}" value="${escape(month.declared_on)}">${error('declared_on')}</label>
    </details>${finish('Enregistrer la déclaration', true)}`;
  const payment = (correction = false) => `${start('payment')}
    <p class="vat-hint">À confirmer après avoir constaté le débit sur Qonto.</p>
    <div class="fiscal-settings-grid">
      <label>${correction ? 'Montant total débité' : 'Montant débité'} (€)<input name="remitted" type="number" min="${correction ? '0' : '0.01'}" step="0.01" value="${(month.remitted || month.payable) / 100}" required>${error('remitted')}</label>
      <label>Date du débit<input name="payment_date" type="date" min="${minimum}" max="${today}" value="${escape(month.payment_date)}" required>${error('payment_date')}</label>
    </div>${correction ? help('Corriger une confirmation erronée', 'Pour retirer un débit enregistré par erreur, renseigne 0 et efface sa date.') : ''}${finish(correction ? 'Enregistrer le paiement' : 'Confirmer le débit')}`;
  const adjustments = `${start('adjustments')}
    ${number('deductible', 'TVA déductible totale du mois (€)', month.deductible)}
    ${help('Quand utiliser cette correction ?', 'Les justificatifs validés permettent d’appliquer ce montant sans ressaisie. Une correction manuelle remplace leur total. La TVA déductible d’autoliquidation est déjà comprise dans ce montant.')}
    <details class="vat-option"><summary>Corriger les montants d’autoliquidation</summary><div class="fiscal-settings-grid">
      ${number('reverse_charge_base', 'Base HT autoliquidée (€)', month.reverseChargeBase)}
      ${number('reverse_charge_due', 'TVA due par autoliquidation (€)', month.reverseChargeDue)}
      ${number('reverse_charge_deductible', 'Dont TVA autoliquidée déductible (€)', month.reverseChargeDeductible)}
    </div></details>${finish('Enregistrer la correction')}`;
  const credit = `${start('credit')}${number('opening_credit', 'Ancien crédit de TVA à reprendre (€)', month.openingCredit)}
    ${help('Comprendre ce champ', 'Uniquement un ancien crédit qui manque dans le suivi. Exemple : 150 € de crédit existant avant le début du dashboard. Les crédits des mois suivis sont déjà reportés automatiquement ; ne les ajoute pas ici.')}${finish('Enregistrer cet ancien crédit')}`;
  let workflow = '';
  if (!month.provisional && !month.declared) workflow = section('declaration', 'J’ai effectué ma déclaration', declaration(), true);
  else if (month.declared && month.remaining > 0) workflow = section('payment', 'Confirmer le débit', payment(), true)
    + section('schedule', month.expected_payment_date ? 'Modifier la date prévue du prélèvement' : 'Ajouter une date prévue · facultatif',
      `${start('schedule')}<label>Date prévue du prélèvement<input name="expected_payment_date" type="date" min="${minimum}" value="${escape(month.expected_payment_date)}">${error('expected_payment_date')}</label><p class="vat-hint">Une date prévue ne confirme pas le paiement.</p>${finish('Enregistrer la date prévue')}`);
  const advanced = `<details class="fiscal-details vat-advanced" data-vat-section="advanced"><summary>Réglages avancés</summary><div class="vat-advanced-content">
    <p class="vat-hint">Corrections manuelles et reprise de données antérieures.</p>
    ${section('adjustments', 'Corriger les montants calculés', adjustments)}
    ${section('credit', `Reprendre un ancien crédit${month.openingCredit ? ' · déjà renseigné' : ''}`, credit)}
    ${month.declared && !month.provisional ? section('declaration', 'Modifier la déclaration enregistrée', declaration()) : ''}
    ${month.remitted > 0 ? section('payment', 'Modifier le paiement confirmé', payment(true)) : ''}
  </div></details>`;
  const note = section('note', month.note ? 'Note du mois' : 'Ajouter une note · facultatif', `${start('note')}<label>Note<textarea name="note" rows="2" maxlength="2000">${escape(month.note)}</textarea></label>${finish('Enregistrer la note')}`);
  return { workflow, advanced, note };
}
