import { expenseCents, expenseReviewState, summarizeExpenseReviews, parisDay } from './supabase/functions/_shared/vat-expenses.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = cents => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const sourceMoney = (cents, currency) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: /^[A-Z]{3}$/.test(currency) ? currency : 'EUR' }).format(cents / 100);
const labels = { pending: 'À vérifier', approved: 'Validée', missing: 'Justificatif manquant', changed: 'À revalider',
  excluded: 'Écartée', duplicate: 'Déjà associée à une facture', manual: 'À examiner', zero: 'Sans TVA détectée' };
const dateLabel = value => value ? value.split('-').reverse().join('/') : 'Date à préciser';

export function initVatDeductions({ supabase, userId, onBusy = () => {}, onRefresh = async () => {} }) {
  let host, month, rows = [];
  let opened = false, loaded = false, loading = false, busy = false, error = '', feedback = '', filter = 'todo';
  let editorId = null;
  let readRequest;
  const disabled = () => busy ? 'disabled' : '';

  function matchesFor(item) {
    if (item.kind !== 'invoice') return [];
    return rows.filter(candidate => candidate.kind === 'transaction' && !candidate.source_missing && !candidate.blocked_reason
      && candidate.currency === item.currency && Math.abs(candidate.amount_cents - item.amount_cents) <= 1
      && (!candidate.duplicate_of || candidate.duplicate_of === item.source_key)
      && (!candidate.auto_duplicate_of || candidate.auto_duplicate_of === item.source_key)
      && (!item.source_date || Math.abs(new Date(candidate.source_date) - new Date(item.source_date)) <= 62 * 86400000));
  }

  function rowMarkup(item) {
    const state = expenseReviewState(item);
    const supported = !item.blocked_reason && !item.credit_note && !item.source_missing && !item.auto_duplicate_of && !item.duplicate_of;
    const canReview = supported && item.attachment_ids.length > 0;
    const candidates = matchesFor(item);
    const date = item.eligible_on || item.payment_date || item.source_date || '';
    const today = parisDay(new Date().toISOString());
    const period = item.deduction_period || month.period;
    return `<details class="vat-expense-row" data-expense-row="${escape(item.id)}" ${editorId === item.id ? 'open' : ''}>
      <summary><span><strong>${escape(item.supplier)}</strong><small>${escape(dateLabel(item.source_date))}${item.reference ? ` · ${escape(item.reference)}` : ''}</small></span><span class="vat-expense-amount">${sourceMoney(item.amount_cents, item.currency)}<small>TVA ${item.vat_cents === null ? 'à préciser' : sourceMoney(item.vat_cents, item.currency)}</small></span><span class="vat-expense-status ${state === 'approved' ? 'is-approved' : ''}">${labels[state]}</span></summary>
      <div class="vat-expense-body">
        ${item.kind === 'invoice' && /malt/i.test(item.supplier) ? '<p class="fiscal-muted">Commission Malt : règlement par retenue sur mission. Vérifie la date de compensation.</p>' : ''}
        ${item.provider_duplicate ? '<p class="fiscal-muted">Qonto signale une facture potentiellement reçue plusieurs fois. Vérifie son numéro avant de retenir ce montant.</p>' : ''}
        ${state === 'changed' ? '<p class="fiscal-muted">Les informations ont changé depuis la validation ou la source n’est plus disponible. Nouvelle vérification nécessaire.</p>' : ''}
        ${item.blocked_reason || item.credit_note ? `<p class="fiscal-muted">${escape(item.credit_note ? 'Avoir : régularisation à examiner hors de ce module.' : item.blocked_reason)}</p>` : ''}
        <div class="fiscal-actions">${item.attachment_ids.length ? `<button class="button button-secondary" type="button" data-expense-document="${escape(item.id)}" ${disabled()}>Voir le justificatif</button>` : '<span class="fiscal-muted">Ajoute la facture dans Qonto puis actualise.</span>'}<a class="button button-secondary" href="https://app.qonto.com/" target="_blank" rel="noopener noreferrer">Ouvrir Qonto ↗</a></div>
        ${canReview ? `<form class="vat-expense-review" data-expense-review="${escape(item.id)}">
          <div class="fiscal-settings-grid">
            <label>TVA déductible retenue (€)<input name="amount" type="number" step="0.01" min="0.01" max="${item.amount_cents / 100}" value="${item.approved_cents ? item.approved_cents / 100 : item.vat_cents ? item.vat_cents / 100 : ''}" placeholder="À vérifier sur la facture" required ${disabled()}></label>
            <label>Mois de déduction<input name="period" type="month" min="2000-01" max="${today.slice(0, 7)}" value="${period.slice(0, 7)}" required ${disabled()}></label>
            <label>Date du droit à déduction<input name="eligible_on" type="date" max="${today}" value="${escape(date)}" required ${disabled()}><small class="fiscal-muted">Paiement / compensation, acquisition d’un bien ou exigibilité selon la facture.</small></label>
            ${candidates.length ? `<label>Rapprochement proposé<select name="match_id" ${disabled()}><option value="">Sans association bancaire</option>${candidates.map(candidate => `<option value="${escape(candidate.id)}" ${item.linked_transaction_key === candidate.source_key ? 'selected' : ''}>${escape(candidate.supplier)} · ${dateLabel(candidate.source_date)} · ${money(candidate.amount_cents)}</option>`).join('')}</select><small class="fiscal-muted">Association dans ce suivi ; aucun paiement n’est lancé.</small></label>` : ''}
          </div>
          <label>Note facultative<input name="note" maxlength="2000" value="${escape(item.review_note)}" ${disabled()}></label>
          <label class="fiscal-check"><input name="confirmed" type="checkbox" required ${disabled()}>J’ai vérifié la facture, l’usage professionnel, le montant et le droit à déduction.</label>
          <div class="fiscal-actions"><button class="button button-secondary" type="submit" ${disabled()}>Valider cette TVA</button></div>
        </form>` : ''}
        <div class="fiscal-actions">${state !== 'excluded' ? `<button class="vat-text-action" type="button" data-expense-decision="excluded" data-expense-id="${escape(item.id)}" ${disabled()}>Écarter</button>` : ''}${['approved', 'excluded', 'changed'].includes(state) ? `<button class="vat-text-action" type="button" data-expense-decision="pending" data-expense-id="${escape(item.id)}" ${disabled()}>Remettre à vérifier</button>` : ''}</div>
      </div>
    </details>`;
  }

  function render() {
    if (!host || !month) return;
    const total = summarizeExpenseReviews(rows, month.period);
    const todo = total.pending + total.missing;
    const visible = total.rows.filter(item => {
      const state = expenseReviewState(item);
      if (state === 'duplicate') return filter === 'all';
      if (filter === 'all') return true;
      if (filter === 'approved') return state === 'approved';
      if (filter === 'missing') return state === 'missing';
      return ['pending', 'changed', 'missing', 'manual'].includes(state) && !(item.blocked_reason || '').includes('Prélèvement fiscal');
    }).sort((a, b) => String(b.source_date).localeCompare(String(a.source_date)));
    host.innerHTML = `<details class="fiscal-details vat-deductions" data-vat-deductions ${opened ? 'open' : ''}>
      <summary>TVA déductible et justificatifs${loaded && todo ? `<span class="vat-review-count">${todo} à vérifier</span>` : ''}</summary>
      <div class="vat-deductions-content">
        <div class="fiscal-actions"><button class="button button-secondary" type="button" data-expenses-sync ${disabled()}>${busy ? 'Traitement…' : 'Actualiser depuis Qonto'}</button><a class="vat-text-action" href="https://app.qonto.com/" target="_blank" rel="noopener noreferrer">Déposer les justificatifs dans Qonto ↗</a></div>
        <p class="fiscal-muted">${money(total.amount)} validés · ${total.pending} à vérifier · ${total.missing} justificatif(s) manquant(s)</p>
        ${loading ? '<p class="fiscal-muted" role="status">Chargement des justificatifs…</p>' : ''}
        ${error ? `<p class="fiscal-muted" role="alert">${escape(error)}</p><button class="vat-text-action" type="button" data-expenses-retry ${disabled()}>Réessayer</button>` : ''}
        <p class="fiscal-muted" data-expenses-feedback role="status" aria-live="polite">${escape(feedback)}</p>
        ${month.declared ? '<p class="fiscal-muted">Mois déjà déclaré : ces montants restent à examiner pour une éventuelle régularisation. Aucune modification automatique.</p>' : `<form class="vat-expense-apply" data-expenses-apply>
          ${month.deduction_source !== 'receipts' && month.deductible > 0 ? `<label class="fiscal-check"><input name="replace_manual" type="checkbox" required ${disabled()}>Remplacer les ${money(month.deductible)} saisis manuellement par ce total ; j’ai vérifié qu’aucune déduction ne manque.</label>` : ''}
          <button class="button button-secondary" type="submit" ${busy || !loaded || error || (!total.approved && month.deduction_source !== 'receipts') ? 'disabled' : ''}>Utiliser le total validé · ${money(total.amount)}</button>
          <p class="fiscal-muted">Remplace le total du mois ; les montants ne sont jamais ajoutés deux fois.</p>
        </form>`}
        <label class="vat-expense-filter">Afficher<select aria-label="Filtrer les justificatifs" data-expenses-filter ${disabled()}>${[['todo','À traiter'],['missing','Justificatifs manquants'],['approved','Validés'],['all','Tous les éléments']].map(([value, label]) => `<option value="${value}" ${filter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <div class="vat-expense-list">${visible.length ? visible.map(rowMarkup).join('') : loaded && !loading && !error ? '<p class="fiscal-muted">Aucun élément dans cette vue. Actualise depuis Qonto après avoir déposé tes factures.</p>' : ''}</div>
        ${total.duplicates ? `<p class="fiscal-muted">${total.duplicates} ${total.duplicates === 1 ? 'opération déjà associée' : 'opérations déjà associées'} à une facture. La TVA sera retenue une seule fois, après validation de la facture.</p>` : ''}
        <p class="fiscal-muted">Seuls les justificatifs vérifiés et validés entrent dans le total. Les avoirs, devises et cas particuliers restent à examiner manuellement.</p>
      </div>
    </details>`;
  }

  async function read(force = false) {
    if (loading) { await readRequest; if (force) return read(); return; }
    loading = true; error = ''; render();
    readRequest = (async () => { try {
      const collected = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error: readError } = await supabase.from('vat_expenses').select('*').eq('user_id', userId).order('source_key').range(offset, offset + 999);
        if (readError) throw readError;
        collected.push(...(data || []));
        if ((data || []).length < 1000) break;
      }
      rows = collected; loaded = true;
    } catch { error = 'Justificatifs indisponibles. Réessaie.'; }
    finally { loading = false; render(); } })();
    return readRequest;
  }

  async function invoke(body) {
    const { data, error, response } = await supabase.functions.invoke('vat-expenses', { body });
    if (error) {
      let detail;
      try { detail = await error.context?.json(); } catch { /* fallback below */ }
      throw new Error(detail?.error || 'Lecture Qonto indisponible. Réessaie.');
    }
    if (data?.error) throw new Error(data.error);
    if (data instanceof Blob) return new Blob([data], { type: response?.headers.get('X-Document-Type') || data.type });
    return data;
  }

  async function mutate(action, message) {
    if (busy) return;
    busy = true; feedback = ''; error = ''; onBusy(true); render();
    try { await action(); await read(true); feedback = message; }
    catch (failure) { feedback = failure.message || 'Enregistrement impossible. Réessaie.'; }
    finally {
      busy = false; onBusy(false); render();
      await onRefresh();
    }
  }

  function mount(node, selectedMonth) {
    if (!node?.addEventListener) return;
    if (month?.period !== selectedMonth.period) { opened = false; filter = 'todo'; editorId = null; feedback = ''; }
    month = selectedMonth;
    host = node;
    node.addEventListener('toggle', event => {
      if (event.target.matches('[data-vat-deductions]')) opened = event.target.open;
      if (event.target.matches('[data-expense-row]') && event.target.open) editorId = event.target.dataset.expenseRow;
    }, true);
    node.addEventListener('change', event => {
      if (event.target.matches('[data-expenses-filter]')) { filter = event.target.value; render(); }
    });
    node.addEventListener('click', async event => {
      const target = event.target.closest('button');
      if (!target || busy) return;
      if (target.hasAttribute('data-expenses-sync')) {
        const period = month.period;
        await mutate(() => invoke({ action: 'sync', period }), 'Synchronisation terminée. Vérifie les propositions avant de les utiliser.');
      } else if (target.hasAttribute('data-expenses-retry')) await read();
      else if (target.dataset.expenseDecision) {
        await mutate(async () => {
          const { error } = await supabase.rpc('review_vat_expense', { p_id: target.dataset.expenseId, p_decision: target.dataset.expenseDecision });
          if (error) throw error;
        }, 'Décision enregistrée.');
      } else if (target.dataset.expenseDocument) {
        const popup = window.open('about:blank', '_blank');
        if (popup) popup.opener = null;
        try {
          const data = await invoke({ action: 'document', id: target.dataset.expenseDocument, preview: true });
          if (!(data instanceof Blob) || !data.size) throw new Error('Aperçu du justificatif indisponible.');
          const objectUrl = URL.createObjectURL(data);
          if (popup) { popup.location.href = objectUrl; setTimeout(() => URL.revokeObjectURL(objectUrl), 300000); }
          else throw new Error('Autorise les fenêtres de justificatif pour ce site, puis réessaie.');
        } catch (failure) { popup?.close(); feedback = failure.message; render(); }
      }
    });
    node.addEventListener('submit', async event => {
      event.preventDefault(); event.stopPropagation();
      if (busy || !event.target.reportValidity()) return;
      const form = event.target;
      if (form.hasAttribute('data-expenses-apply')) {
        const period = month.period;
        await mutate(async () => {
          const { error } = await supabase.rpc('apply_vat_deductions', { p_period: period, p_replace_manual: form.elements.replace_manual?.checked === true });
          if (error) throw error;
        }, 'Total validé utilisé pour ce mois.');
      } else if (form.dataset.expenseReview) {
        const amount = expenseCents(form.elements.amount.value);
        if (amount === null || amount <= 0) { feedback = 'Montant de TVA invalide.'; render(); return; }
        const params = { p_id: form.dataset.expenseReview, p_decision: 'approved', p_amount_cents: amount,
          p_period: `${form.elements.period.value}-01`, p_eligible_on: form.elements.eligible_on.value,
          p_confirmed: form.elements.confirmed.checked, p_match_id: form.elements.match_id?.value || null, p_note: form.elements.note.value };
        await mutate(async () => {
          const { error } = await supabase.rpc('review_vat_expense', params);
          if (error) throw error;
        }, 'TVA validée. Utilise ensuite le total pour le mois retenu.');
      }
    });
    render();
    if (!loaded && !loading) read();
  }
  return { mount };
}
