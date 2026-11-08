import { cents, day } from './fiscal-model.js';
import { defaultVatPeriod, summarizeMonthlyVat, validateVatRecord } from './vat-monthly.js';

const money = value => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value / 100);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const periodLabel = period => day(period).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const dateLabel = date => day(date)?.toLocaleDateString('fr-FR') || '';
const columns = 'period,deductible,opening_credit,declared,declared_balance,declared_on,remitted,payment_date,expected_payment_date,note';

export function initVatPanel(getMissions, userId, supabase, onChange = () => {}, onSelect = () => {}) {
  const panel = document.getElementById('fiscalVatPanel');
  let selectedPeriod = defaultVatPeriod();
  let records = [], legacy = [];
  let loading = false, loaded = false, error = false, saving = false;
  let request;
  const summary = () => summarizeMonthlyVat(getMissions(), records, legacy, new Date(), selectedPeriod);
  function getVatDue() {
    if (!loaded || loading || error || saving) return null;
    try { return summary().reserve; } catch { return null; }
  }
  function setBusy(busy) {
    saving = busy;
    for (const id of ['fiscalYear', 'fiscalMonth']) document.getElementById(id).disabled = busy;
    panel.querySelectorAll('button,input,textarea').forEach(input => { input.disabled = busy; });
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
    const declarationMonth = new Date(day(month.period).getFullYear(), day(month.period).getMonth() + 1, 1)
      .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const firstActivity = data.months.find(row => row.collected || records.some(record => record.period === row.period))?.period || selectedPeriod;
    const history = data.months.filter(row => row.period.slice(0, 4) === selectedPeriod.slice(0, 4) && (row.period >= firstActivity || row.period === selectedPeriod)).reverse();
    panel.innerHTML = `
      <div class="fiscal-hero">
        <div class="vat-heading"><p class="section-kicker">${month.credit ? 'Crédit à reporter' : 'Reste à payer'} · ${escape(periodLabel(month.period))}</p><span class="fiscal-state ${month.status.style}">${month.status.label}</span></div>
        <strong class="fiscal-amount">${money(month.credit || month.remaining)}</strong>
        <p class="fiscal-muted">${month.provisional ? 'Provision du mois en cours' : `Période : ${escape(periodLabel(month.period))} · règlement en ${declarationMonth}`}${month.estimated ? ' · montant estimé' : ''}</p>
        ${month.expected_payment_date && month.remaining ? `<p class="fiscal-muted">Prélèvement attendu vers le ${dateLabel(month.expected_payment_date)} · date estimée</p>` : ''}
        ${month.payment_date ? `<p class="fiscal-muted">Débit confirmé le ${dateLabel(month.payment_date)} : ${money(month.remitted)}</p>` : ''}
        ${month.note ? `<p class="vat-note">${escape(month.note)}</p>` : ''}
      </div>
      <div class="fiscal-stats vat-stats">
        <div class="fiscal-stat"><p class="fiscal-muted">TVA collectée du mois</p><strong>${money(month.collected)}</strong></div>
        <div class="fiscal-stat"><p class="fiscal-muted">TVA déductible du mois</p><strong>${money(month.deductible)}</strong></div>
        <div class="fiscal-stat"><p class="fiscal-muted">Crédit antérieur disponible</p><strong>${money(month.carriedCredit + month.openingCredit)}</strong></div>
        <div class="fiscal-stat"><p class="fiscal-muted">TVA nette à reverser${month.estimated ? ' · estimée' : ' · déclarée'}</p><strong>${money(month.payable)}</strong></div>
      </div>
      <p class="fiscal-muted">Déjà payé pour cette déclaration : <strong>${money(month.remitted)}</strong>. ${month.credit ? `Crédit reporté au mois suivant : ${money(month.credit)}.` : ''}</p>
      ${month.declared && month.estimated ? '<p class="fiscal-notice">Déclaration confirmée. Renseigne le solde réellement déclaré pour figer le montant ; le montant affiché reste une estimation issue des missions et déductions.</p>' : ''}
      ${!month.estimated && month.net !== month.computedNet ? `<p class="fiscal-notice">Solde déclaré : ${money(month.net)} · calcul actuel : ${money(month.computedNet)}. Vérifie cet écart avant toute régularisation.</p>` : ''}
      ${month.overpaid ? `<p class="fiscal-notice">Versement supérieur au montant à payer de ${money(month.overpaid)}. Cet écart n’est pas transformé automatiquement en crédit de TVA.</p>` : ''}
      <details class="fiscal-details" data-vat-editor><summary>Déductions, déclaration et paiement</summary>
        <form class="vat-adjustments">
          <div class="fiscal-settings-grid">
            <label>TVA déductible du mois (€)<input name="deductible" type="number" min="0" step="0.01" value="${month.deductible / 100}" required></label>
            <label>Crédit initial complémentaire (€)<input name="opening_credit" type="number" min="0" step="0.01" value="${month.openingCredit / 100}" required><small class="fiscal-muted">Uniquement un crédit antérieur absent du suivi. Le report calculé ci-dessus est automatique.</small></label>
          </div>
          <label class="fiscal-check"><input name="declared" type="checkbox" ${month.declared ? 'checked' : ''} ${month.provisional ? 'disabled' : ''}>Déclaration effectuée pour ${escape(periodLabel(month.period))}</label>
          <div class="fiscal-settings-grid">
            <label>Solde réellement déclaré (€)<input name="declared_balance" type="number" step="0.01" value="${month.declaredBalance === null ? '' : month.declaredBalance / 100}" placeholder="À compléter"><small class="fiscal-muted">Positif : à payer · négatif : crédit. Vide : estimation.</small></label>
            <label>Date de déclaration, si connue<input name="declared_on" type="date" value="${escape(month.declared_on)}"></label>
          </div>
          <div class="fiscal-settings-grid">
            <label>Montant réellement débité (€)<input name="remitted" type="number" min="0" step="0.01" value="${month.remitted / 100}" required></label>
            <label>Date effective du débit<input name="payment_date" type="date" value="${escape(month.payment_date)}"></label>
          </div>
          <p class="fiscal-muted">Un prélèvement annoncé reste à payer jusqu’à confirmation du débit sur Qonto.</p>
          <label>Date estimée du prélèvement<input name="expected_payment_date" type="date" value="${escape(month.expected_payment_date)}"></label>
          <label>Note<textarea name="note" rows="2" maxlength="2000">${escape(month.note)}</textarea></label>
          <div class="fiscal-actions"><button class="button button-secondary" type="submit">Enregistrer ce mois</button><a class="button button-secondary" href="https://www.impots.gouv.fr/" target="_blank" rel="noopener noreferrer">Espace professionnel ↗</a></div>
          <p class="fiscal-muted" data-vat-feedback role="status" aria-live="polite"></p>
        </form>
      </details>
      <details class="fiscal-details"><summary>Encaissements · ${escape(periodLabel(month.period))} · ${month.payments.length}</summary>
        ${month.payments.length ? `<div class="fiscal-table-wrap"><table class="fiscal-table"><thead><tr><th>Mission</th><th>Encaissement</th><th>HT</th><th>TVA</th><th>TTC</th></tr></thead><tbody>${month.payments.map(p => `<tr><td>${escape(p.mission.title)}</td><td>${p.payment.toLocaleDateString('fr-FR')}</td><td>${money(p.net)}</td><td>${money(p.vat)}</td><td>${money(p.gross)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="fiscal-muted">Aucune TVA encaissée pendant ce mois.</p>'}
      </details>
      <details class="fiscal-details" open><summary>Historique mensuel · ${selectedPeriod.slice(0, 4)}</summary>
        <div class="fiscal-table-wrap"><table class="fiscal-table"><thead><tr><th>Mois</th><th>État</th><th>TVA nette</th><th>Payé</th><th>Reste / crédit</th></tr></thead><tbody>${history.map(row => `<tr ${row.period === selectedPeriod ? 'aria-current="true"' : ''}><td><button class="vat-month-link" type="button" data-vat-period="${row.period}">${escape(periodLabel(row.period))}</button></td><td><span class="fiscal-state ${row.status.style}">${row.status.label}</span></td><td>${money(row.payable)}</td><td>${money(row.remitted)}</td><td>${row.credit ? `${money(row.credit)} de crédit` : money(row.remaining)}</td></tr>`).join('')}</tbody></table></div>
      </details>
      ${data.issues.length ? `<details class="fiscal-details"><summary>${data.issues.length} mission(s) exclue(s) · à vérifier</summary><ul>${data.issues.map(i => `<li>${escape(i.mission.title)} — ${escape(i.reason)}</li>`).join('')}</ul></details>` : ''}
      ${legacy.length ? `<details class="fiscal-details"><summary>Anciens ajustements annuels${data.unreconciled.length ? ' · reprise nécessaire' : ' · archives'}</summary><p class="fiscal-muted">Ces montants sont conservés sans répartition automatique. Reporte les déductions et paiements dans leurs mois, puis confirme la reprise. Un crédit initial se saisit une seule fois ; une dette antérieure reste rattachée à son mois.</p>${legacy.map(row => `<div class="vat-legacy"><p>${row.year} · Déductible : ${money(cents(row.deductible))} · Reversé : ${money(cents(row.remitted))} · Solde initial : ${money(cents(row.opening_balance))}</p>${data.unreconciled.includes(row) ? `<button class="button button-secondary" type="button" data-vat-reconcile="${row.year}">Confirmer la répartition mensuelle de ${row.year}</button>` : ''}</div>`).join('')}</details>` : ''}
      ${data.unreconciled.length ? '<p class="fiscal-notice" role="alert">Réserve de trésorerie indisponible tant que les anciens ajustements annuels ne sont pas rapprochés.</p>' : ''}`;
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
    if (event.target.closest('[data-vat-retry]')) { await refresh(selectedPeriod, true); return; }
    const period = event.target.closest('[data-vat-period]')?.dataset.vatPeriod;
    if (period && !saving) { selectedPeriod = period; onSelect(period); render(); return; }
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
      panel.querySelector('[data-vat-feedback]').textContent = 'Échec de la confirmation de reprise. Réessaie.';
    } finally { onChange(); }
  });
  panel.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    const form = event.target;
    if (!form.reportValidity()) return;
    const feedback = form.querySelector('[data-vat-feedback]');
    const value = name => form.elements[name].value;
    const record = { user_id: userId, period: selectedPeriod,
      deductible: value('deductible'), opening_credit: value('opening_credit'), declared: form.elements.declared.checked,
      declared_balance: value('declared_balance') === '' ? null : value('declared_balance'), declared_on: value('declared_on') || null,
      remitted: value('remitted'), payment_date: value('payment_date') || null, expected_payment_date: value('expected_payment_date') || null,
      note: value('note').trim() };
    try {
      const parsed = validateVatRecord(record);
      Object.assign(record, { deductible: parsed.deductible / 100, opening_credit: parsed.openingCredit / 100,
        remitted: parsed.remitted / 100, declared_balance: parsed.declaredBalance === null ? null : parsed.declaredBalance / 100 });
    } catch (validationError) { feedback.textContent = validationError.message; return; }
    setBusy(true);
    onChange();
    feedback.textContent = 'Enregistrement…';
    try {
      const { data, error: saveError } = await supabase.from('vat_months').upsert(record, { onConflict: 'user_id,period' }).select(columns).single();
      if (saveError || !data) throw saveError || new Error('Aucune déclaration enregistrée.');
      records = [...records.filter(row => row.period !== record.period), data];
      setBusy(false);
      render();
      panel.querySelector('[data-vat-editor]').open = true;
      panel.querySelector('[data-vat-feedback]').textContent = 'Mois enregistré.';
    } catch {
      setBusy(false);
      feedback.textContent = 'Échec de l’enregistrement. Réessaie.';
    } finally { onChange(); }
  });
  refresh();
  return { refresh, getVatDue, getYears: () => [...new Set(records.map(row => Number(row.period.slice(0, 4))))] };
}
