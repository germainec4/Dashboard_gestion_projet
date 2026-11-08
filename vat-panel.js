import { cents, day } from './fiscal-model.js';
import { defaultVatPeriod, summarizeMonthlyVat } from './vat-monthly.js';
import { initVatDeductions } from './vat-deductions.js';
import { prepareVatRecord } from './vat-editor.js';
import { vatMonthForms } from './vat-forms.js';

const money = value => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value / 100);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const periodLabel = period => day(period).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const dateLabel = date => day(date)?.toLocaleDateString('fr-FR') || '';
const columns = 'period,deductible,reverse_charge_base,reverse_charge_due,reverse_charge_deductible,opening_credit,declared,declared_balance,declared_on,remitted,payment_date,expected_payment_date,note,deduction_source,deduction_snapshot,deduction_applied_at,deduction_needs_review';

export function initVatPanel(getMissions, userId, supabase, onChange = () => {}, onSelect = () => {}) {
  const panel = document.getElementById('fiscalVatPanel');
  let selectedPeriod = defaultVatPeriod();
  let records = [], legacy = [];
  let loading = false, loaded = false, error = false, saving = false;
  let feedbackMessage = '';
  const busyControls = new Map();
  let request;
  const deductions = initVatDeductions({ supabase, userId,
    onBusy: value => { setBusy(value); onChange(); }, onRefresh: () => refresh(selectedPeriod, true) });
  const summary = () => summarizeMonthlyVat(getMissions(), records, legacy, new Date(), selectedPeriod);
  function getVatDue() {
    if (!loaded || loading || error || saving || records.some(row => !row.declared && row.deduction_needs_review)) return null;
    try { return summary().reserve; } catch { return null; }
  }
  function setBusy(busy) {
    saving = busy;
    if (busy) {
      const controls = [...panel.querySelectorAll('button,input,select,textarea'), ...['fiscalYear', 'fiscalMonth'].map(id => document.getElementById(id))];
      for (const control of controls) {
        if (!busyControls.has(control)) busyControls.set(control, control.disabled);
        control.disabled = true;
      }
    } else {
      for (const [control, disabled] of busyControls) control.disabled = disabled;
      busyControls.clear();
    }
    panel.setAttribute?.('aria-busy', String(busy));
  }
  function render() {
    if (loading || !loaded) {
      panel.innerHTML = '<p class="fiscal-muted" role="status">Chargement de la TVA mensuelle…</p>';
      return;
    }
    if (error) {
      panel.innerHTML = '<p class="fiscal-notice" role="alert">Suivi TVA indisponible.</p><button type="button" class="button button-secondary" data-vat-retry>Réessayer</button>';
      return;
    }
    let data;
    try { data = summary(); }
    catch {
      panel.innerHTML = '<p class="fiscal-notice" role="alert">Données TVA incohérentes. Vérifie les déclarations enregistrées.</p>';
      return;
    }
    const month = data.months.find(row => row.period === selectedPeriod);
    if (!month) {
      panel.innerHTML = '<p class="fiscal-muted">Aucune période TVA suivie pour ce mois.</p>';
      return;
    }
    const paid = month.declared && month.payable > 0 && !month.remaining;
    const title = month.credit ? 'Crédit à reporter' : paid ? 'Paiement confirmé' : month.provisional ? 'TVA à prévoir' : month.declared ? 'Reste à payer' : 'TVA à déclarer';
    const explanation = month.provisional ? 'Estimation du mois en cours. La déclaration s’enregistre une fois le mois terminé.'
      : !month.declared ? 'Prépare tes justificatifs, puis enregistre ta déclaration une fois effectuée.'
      : month.credit ? 'Ce crédit est reporté automatiquement au mois suivant.'
      : !month.payable ? 'Aucun règlement à prévoir pour cette déclaration.'
      : paid ? 'Le débit a été confirmé pour cette déclaration.' : 'La déclaration est enregistrée. Le débit reste à confirmer.';
    const forms = vatMonthForms(month);
    const firstActivity = data.months.find(row => row.collected || records.some(record => record.period === row.period))?.period || selectedPeriod;
    const history = data.months.filter(row => row.period.slice(0, 4) === selectedPeriod.slice(0, 4) && (row.period >= firstActivity || row.period === selectedPeriod)).reverse();
    panel.innerHTML = `
      <div class="fiscal-hero">
        <div class="vat-heading"><p class="section-kicker">${title} · ${escape(periodLabel(month.period))}</p><span class="fiscal-state ${month.status.style}">${month.status.label}</span></div>
        <strong class="fiscal-amount">${money(month.credit || (paid ? month.remitted : month.remaining))}</strong>
        <p class="vat-hint">${explanation}${month.estimated && !month.provisional ? ' Montant estimé.' : ''}</p>
        ${month.expected_payment_date && month.remaining ? `<p class="vat-payment-date">Prélèvement prévu vers le ${dateLabel(month.expected_payment_date)}</p>` : ''}
        ${month.payment_date ? `<p class="vat-payment-date">Débit du ${dateLabel(month.payment_date)} · ${money(month.remitted)}</p>` : ''}
      </div>
      <div class="vat-overview">
        <div><span>TVA collectée du mois</span><strong>${money(month.collected)}</strong></div>
        <div><span>Déductions retenues</span><strong>${money(month.deductible)}</strong></div>
        ${month.carriedCredit + month.openingCredit ? `<div><span>Crédit antérieur disponible</span><strong>${money(month.carriedCredit + month.openingCredit)}</strong></div>` : ''}
      </div>
      ${month.reverseChargeDue ? `<details class="vat-option vat-calculation"><summary>Détail du calcul et autoliquidation</summary><div class="vat-reverse-summary vat-hint"><span>TVA due par autoliquidation : ${money(month.reverseChargeDue)}</span><span>Dont TVA déductible : ${money(month.reverseChargeDeductible)} · comprise dans les déductions</span><span>Base HT : ${money(month.reverseChargeBase)}</span>${month.reverseChargeRegions.eu || month.reverseChargeRegions.non_eu ? `<span>Services UE hors France : ${money(month.reverseChargeRegions.eu)} HT · hors UE : ${money(month.reverseChargeRegions.non_eu)} HT</span>` : ''}<span>TVA totale due : ${money(month.collected + month.reverseChargeDue)} · déductible totale : ${money(month.deductible)}</span></div></details>` : ''}
      <p class="vat-save-status" data-vat-status role="status" aria-live="polite">${escape(feedbackMessage)}</p>
      ${month.deduction_needs_review && !month.declared ? '<p class="fiscal-notice">Des justificatifs ont changé. Vérifie-les et applique à nouveau les montants validés pour mettre à jour l’estimation.</p>' : ''}
      ${month.declared && month.estimated ? '<p class="vat-hint">Le montant réellement déclaré reste à préciser. <button class="vat-text-action" type="button" data-vat-open="declaration">Préciser le montant</button></p>' : ''}
      ${!month.estimated && month.net !== month.computedNet ? `<p class="fiscal-notice">Solde déclaré : ${money(month.net)} · calcul actuel : ${money(month.computedNet)}. Vérifie cet écart avant toute régularisation.</p>` : ''}
      ${month.overpaid ? `<p class="fiscal-notice">Versement supérieur au montant à payer de ${money(month.overpaid)}. Cet écart n’est pas transformé automatiquement en crédit de TVA.</p>` : ''}
      ${forms.workflow}
      <div data-vat-deductions-host></div>
      <div class="vat-secondary-sections">${forms.note}${forms.advanced}</div>
      <details class="fiscal-details"><summary>Encaissements · ${escape(periodLabel(month.period))} · ${month.payments.length}</summary>
        ${month.payments.length ? `<div class="fiscal-table-wrap"><table class="fiscal-table"><thead><tr><th>Mission</th><th>Encaissement</th><th>HT</th><th>TVA</th><th>TTC</th></tr></thead><tbody>${month.payments.map(p => `<tr><td>${escape(p.mission.title)}</td><td>${p.payment.toLocaleDateString('fr-FR')}</td><td>${money(p.net)}</td><td>${money(p.vat)}</td><td>${money(p.gross)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="fiscal-muted">Aucune TVA encaissée pendant ce mois.</p>'}
      </details>
      <details class="fiscal-details"><summary>Historique mensuel · ${selectedPeriod.slice(0, 4)}</summary>
        <div class="fiscal-table-wrap"><table class="fiscal-table"><thead><tr><th>Mois</th><th>État</th><th>TVA nette</th><th>Payé</th><th>Reste / crédit</th></tr></thead><tbody>${history.map(row => `<tr ${row.period === selectedPeriod ? 'aria-current="true"' : ''}><td><button class="vat-month-link" type="button" data-vat-period="${row.period}">${escape(periodLabel(row.period))}</button></td><td><span class="fiscal-state ${row.status.style}">${row.status.label}</span></td><td>${money(row.payable)}</td><td>${money(row.remitted)}</td><td>${row.credit ? `${money(row.credit)} de crédit` : money(row.remaining)}</td></tr>`).join('')}</tbody></table></div>
      </details>
      ${data.issues.length ? `<details class="fiscal-details"><summary>${data.issues.length} mission(s) exclue(s) · à vérifier</summary><ul>${data.issues.map(i => `<li>${escape(i.mission.title)} — ${escape(i.reason)}</li>`).join('')}</ul></details>` : ''}
      ${legacy.length ? `<details class="fiscal-details"><summary>Anciens ajustements annuels${data.unreconciled.length ? ' · reprise nécessaire' : ' · archives'}</summary><p class="fiscal-muted">Ces montants sont conservés sans répartition automatique. Reporte les déductions et paiements dans leurs mois, puis confirme la reprise. Un crédit initial se saisit une seule fois ; une dette antérieure reste rattachée à son mois.</p>${legacy.map(row => `<div class="vat-legacy"><p>${row.year} · Déductible : ${money(cents(row.deductible))} · Reversé : ${money(cents(row.remitted))} · Solde initial : ${money(cents(row.opening_balance))}</p>${data.unreconciled.includes(row) ? `<button class="button button-secondary" type="button" data-vat-reconcile="${row.year}">Confirmer la répartition mensuelle de ${row.year}</button>` : ''}</div>`).join('')}</details>` : ''}
      ${data.unreconciled.length ? '<p class="fiscal-notice" role="alert">Réserve de trésorerie indisponible tant que les anciens ajustements annuels ne sont pas rapprochés.</p>' : ''}`;
    deductions.mount(panel.querySelector('[data-vat-deductions-host]'), month);
  }
  async function readRows(table, fields, order) {
    const rows = [];
    for (let start = 0; ; start += 1000) {
      const { data, error: readError } = await supabase.from(table).select(fields).eq('user_id', userId).order(order).range(start, start + 999);
      if (readError) throw readError;
      rows.push(...(data || []));
      if ((data || []).length < 1000) return rows;
    }
  }
  async function refresh(period = selectedPeriod, force = false) {
    if (saving) return;
    if (period !== selectedPeriod || force) feedbackMessage = '';
    selectedPeriod = period;
    if (loading) return request;
    if (loaded && !force) { render(); return; }
    loading = true;
    error = false;
    render();
    onChange();
    request = (async () => {
      try {
        const [months, years] = await Promise.all([
          readRows('vat_months', columns, 'period'),
          readRows('vat_years', 'year,deductible,remitted,opening_balance,monthly_reconciled', 'year')
        ]);
        records = months;
        legacy = years;
        loaded = true;
      } catch { error = true; loaded = true; }
      finally { loading = false; render(); onChange(); }
    })();
    return request;
  }
  panel.addEventListener('click', async event => {
    if (event.target.closest('[data-vat-deductions]')) return;
    if (event.target.closest('[data-vat-retry]')) { await refresh(selectedPeriod, true); return; }
    const open = event.target.closest('[data-vat-open]')?.dataset.vatOpen;
    if (open && !saving) {
      const section = panel.querySelector(`[data-vat-section="${open}"]`);
      for (let node = section; node && node !== panel; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true;
      section?.scrollIntoView({ block: 'nearest' });
      section?.querySelector('input,select,textarea')?.focus({ preventScroll: true });
      return;
    }
    const period = event.target.closest('[data-vat-period]')?.dataset.vatPeriod;
    if (period && !saving) { feedbackMessage = ''; selectedPeriod = period; onSelect(period); render(); return; }
    const year = event.target.closest('[data-vat-reconcile]')?.dataset.vatReconcile;
    if (!year || saving) return;
    setBusy(true);
    onChange();
    try {
      const { data, error: saveError } = await supabase.from('vat_years').update({ monthly_reconciled: true }).eq('user_id', userId).eq('year', Number(year)).select('year').single();
      if (saveError || !data) throw saveError || new Error('Aucune reprise enregistrée.');
      legacy = legacy.map(row => row.year === Number(year) ? { ...row, monthly_reconciled: true } : row);
      setBusy(false);
      render();
    } catch {
      setBusy(false);
      panel.querySelector('[data-vat-status]').textContent = 'Échec de la confirmation de reprise. Réessaie.';
    } finally { onChange(); }
  });
  panel.addEventListener('input', event => {
    const form = event.target.closest('[data-vat-form]');
    if (!form) return;
    event.target.removeAttribute('aria-invalid');
    event.target.setCustomValidity?.('');
    const error = form.querySelector(`[data-vat-error="${event.target.name}"]`);
    if (error) { error.hidden = true; error.textContent = ''; }
    if (form.dataset.vatForm === 'payment' && event.target.name === 'remitted') {
      form.elements.payment_date.required = Number(event.target.value) > 0;
    }
  });
  panel.addEventListener('submit', async event => {
    if (event.target.closest('[data-vat-deductions]')) return;
    event.preventDefault();
    if (saving) return;
    const form = event.target;
    if (!form.dataset.vatForm) return;
    if (!form.reportValidity()) return;
    const feedback = form.querySelector('[data-vat-feedback]');
    const values = {};
    for (const name of ['declared_amount', 'declared_kind', 'declared_on', 'remitted', 'payment_date', 'expected_payment_date',
      'deductible', 'reverse_charge_base', 'reverse_charge_due', 'reverse_charge_deductible', 'opening_credit', 'note']) {
      if (form.elements[name]) values[name] = form.elements[name].value;
    }
    let record;
    try {
      const previous = records.find(row => row.period === selectedPeriod);
      record = prepareVatRecord({ ...previous, user_id: userId }, selectedPeriod, form.dataset.vatForm, values);
    } catch (validationError) {
      const field = form.elements[validationError.field];
      const message = field && form.querySelector(`[data-vat-error="${validationError.field}"]`);
      if (message) {
        message.hidden = false; message.textContent = validationError.message;
        field.setAttribute('aria-invalid', 'true'); field.focus();
      } else feedback.textContent = validationError.message;
      return;
    }
    setBusy(true);
    onChange();
    feedback.textContent = 'Enregistrement…';
    try {
      const { data, error: saveError } = await supabase.from('vat_months').upsert(record, { onConflict: 'user_id,period' }).select(columns).single();
      if (saveError || !data) throw saveError || new Error('Aucune déclaration enregistrée.');
      records = [...records.filter(row => row.period !== record.period), data];
      setBusy(false);
      feedbackMessage = ({ declaration: 'Déclaration enregistrée.', payment: 'Paiement enregistré.', schedule: 'Date prévue enregistrée.',
        adjustments: 'Correction enregistrée.', credit: 'Ancien crédit enregistré.', note: 'Note enregistrée.' })[form.dataset.vatForm];
      render();
    } catch {
      setBusy(false);
      feedback.textContent = 'Échec de l’enregistrement. Réessaie.';
    } finally { onChange(); }
  });
  refresh();
  return { refresh, getVatDue, getYears: () => [...new Set(records.map(row => Number(row.period.slice(0, 4))))] };
}
