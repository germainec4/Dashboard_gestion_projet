import { summarizeVat } from './vat-model.js';
import { cents } from './fiscal-model.js';

const money = value => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value / 100);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function initVatPanel(getMissions, userId, supabase) {
  const panel = document.getElementById('fiscalVatPanel');
  const records = new Map();
  let selectedYear;
  let saving = false;
  function render() {
    const state = records.get(selectedYear);
    if (!state || state.loading) {
      panel.innerHTML = '<p class="fiscal-muted" role="status">Chargement de la TVA…</p>';
      return;
    }
    if (state.error) {
      panel.innerHTML = '<p class="fiscal-notice" role="alert">Suivi TVA indisponible.</p><button type="button" class="button button-secondary" data-vat-retry>Réessayer</button>';
      return;
    }
    const data = summarizeVat(getMissions(), selectedYear, state.data);
    panel.innerHTML = `
      <div class="fiscal-hero"><p class="section-kicker">${data.balance < 0 ? 'Solde créditeur' : 'Reste à reverser'} · estimé</p>
        <strong class="fiscal-amount">${money(Math.abs(data.balance))}</strong>
        <p class="fiscal-muted">Cumul ${selectedYear} · encaissements complets, hors acomptes</p>
      </div>
      <div class="fiscal-stats"><div class="fiscal-stat"><p class="fiscal-muted">TVA encaissée</p><strong>${money(data.collected)}</strong></div><div class="fiscal-stat"><p class="fiscal-muted">Déjà reversée</p><strong>${money(data.remitted)}</strong></div></div>
      ${selectedYear === new Date().getFullYear() && data.pending ? `<p class="fiscal-muted">À encaisser · devis acceptés : ${money(data.pending)}</p>` : ''}
      <details class="fiscal-details"><summary>Déductions &amp; versements</summary>
        <form class="vat-adjustments">
          <div class="fiscal-settings-grid">
            <label>TVA déductible ${selectedYear} (€)<input name="deductible" type="number" min="0" step="0.01" value="${data.deductible / 100}" required></label>
            <label>TVA déjà reversée ${selectedYear} (€)<input name="remitted" type="number" min="0" step="0.01" value="${data.remitted / 100}" required></label>
          </div>
          <label>Solde au 1er janvier (€)<input name="opening_balance" type="number" step="0.01" value="${data.opening / 100}" required></label>
          <p class="fiscal-muted">Totaux annuels à saisir. Solde initial : + dû / − crédit, report manuel.</p>
          <div class="fiscal-actions"><button class="button button-secondary" type="submit">Enregistrer</button></div>
          <p class="fiscal-muted" data-vat-feedback role="status"></p>
        </form>
      </details>
      <details class="fiscal-details"><summary>Encaissements TVA · ${data.payments.length}</summary>
        ${data.payments.length ? `<div class="fiscal-table-wrap"><table class="fiscal-table"><thead><tr><th>Mission</th><th>Paiement</th><th>HT</th><th>TVA</th><th>TTC</th></tr></thead><tbody>${data.payments.map(p => `<tr><td>${escape(p.mission.title)}</td><td>${p.payment.toLocaleDateString('fr-FR')}</td><td>${money(p.net)}</td><td>${money(p.vat)}</td><td>${money(p.gross)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="fiscal-muted">Aucune TVA encaissée.</p>'}
      </details>
      ${data.issues.length ? `<details class="fiscal-details"><summary>${data.issues.length} mission(s) exclue(s) · à vérifier</summary><ul>${data.issues.map(i => `<li>${escape(i.mission.title)} — ${escape(i.reason)}</li>`).join('')}</ul></details>` : ''}`;
  }
  async function refresh(year, force = false) {
    if (saving) return;
    selectedYear = year;
    if (records.get(year)?.loading || (records.has(year) && !force)) { if (!saving) render(); return; }
    records.set(year, { loading: true });
    render();
    try {
      const { data, error } = await supabase.from('vat_years').select('deductible,remitted,opening_balance').eq('user_id', userId).eq('year', year).maybeSingle();
      if (error) throw error;
      records.set(year, { data: data || {} });
    } catch { records.set(year, { error: true }); }
    if (selectedYear === year && !saving) render();
  }
  panel.addEventListener('click', event => {
    if (event.target.closest('[data-vat-retry]')) refresh(selectedYear, true);
  });
  panel.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    const form = event.target;
    if (!form.reportValidity()) return;
    const year = selectedYear;
    const values = Object.fromEntries(['deductible', 'remitted', 'opening_balance'].map(name => [name, cents(form.elements[name].value) / 100]));
    const button = form.querySelector('button');
    const feedback = form.querySelector('[data-vat-feedback]');
    saving = true;
    document.getElementById('fiscalYear').disabled = true;
    button.disabled = true;
    feedback.textContent = 'Enregistrement…';
    try {
      const { data, error } = await supabase.from('vat_years').upsert({ user_id: userId, year, ...values }, { onConflict: 'user_id,year' }).select('deductible,remitted,opening_balance').single();
      if (error) throw error;
      records.set(year, { data });
      render();
      if (selectedYear === year) {
        panel.querySelector('details').open = true;
        panel.querySelector('[data-vat-feedback]').textContent = 'Enregistré.';
      }
    } catch { feedback.textContent = 'Échec de l’enregistrement. Réessaie.'; }
    finally { saving = false; button.disabled = false; document.getElementById('fiscalYear').disabled = false; }
  });
  return { refresh };
}
