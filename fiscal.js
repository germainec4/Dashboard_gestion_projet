import './fiscal.css';
import { initVatPanel } from './vat-panel.js';
import { defaultVatPeriod } from './vat-monthly.js';
import { day, defaultPeriod, declarationWindow, summarizeMissions, calendarEvent, paymentsCsv } from './fiscal-model.js';

const money = value => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value / 100);
const dateLabel = date => date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function download(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function initFiscalPanel(getMissions, userId, supabase, onVatChange) {
  const el = id => document.getElementById(id);
  const dialog = el('fiscalDialog');
  const initial = defaultPeriod();
  let year = initial.year;
  let quarter = initial.quarter;
  let activeTab = 'quarter';
  let vatMonth = Number(defaultVatPeriod().slice(5, 7));
  const selectedVatPeriod = () => `${year}-${String(vatMonth).padStart(2, '0')}-01`;
  const vatPanel = initVatPanel(getMissions, userId, supabase, onVatChange, period => {
    year = Number(period.slice(0, 4));
    vatMonth = Number(period.slice(5, 7));
    loadSettings();
    refresh();
  });
  const tabs = { quarter: 'fiscalQuarter', vat: 'fiscalVat' };
  let snapshot;
  const settingsByYear = new Map();
  const key = selected => `fiscal-settings-v1:${userId}:${selected}`;
  function settingsFor(selected) {
    if (!settingsByYear.has(selected)) {
      let stored = {};
      try { stored = JSON.parse(localStorage.getItem(key(selected)) || '{}') || {}; } catch { /* Defaults remain usable. */ }
      settingsByYear.set(selected, {
        confirmed: stored.confirmed === true, includeCosts: stored.includeCosts === true
      });
    }
    return settingsByYear.get(selected);
  }
  function loadSettings() {
    const settings = settingsFor(year);
    el('fiscalConfirmed').checked = settings.confirmed;
    el('fiscalCosts').checked = settings.includeCosts;
  }
  function saveSettings() {
    const settings = { confirmed: el('fiscalConfirmed').checked, includeCosts: el('fiscalCosts').checked };
    settingsByYear.set(year, settings);
    try {
      localStorage.setItem(key(year), JSON.stringify(settings));
      el('fiscalFeedback').textContent = 'Paramètres enregistrés.';
    } catch { el('fiscalFeedback').textContent = 'Enregistrement indisponible : paramètres conservés pour cette session.'; }
    refresh();
  }
  function issuesMarkup(issues) {
    if (!issues.length) return '';
    return `<details class="fiscal-details"><summary>${issues.length} mission(s) exclue(s) · à vérifier</summary><ul>${issues.map(({ mission, reason }) => `<li>${escape(mission.title)} — ${escape(reason)}</li>`).join('')}</ul></details>`;
  }
  function renderQuarter(data, settings, now) {
    const { window, payments, total } = data;
    const stateLabel = { upcoming: 'À venir', open: 'Ouverte', closed: 'Période terminée' }[window.state];
    const provisional = now < window.opening;
    el('fiscalQuarterPanel').innerHTML = `
      <div class="fiscal-hero"><p class="section-kicker">${settings.confirmed && !data.issues.length ? 'CA HT à déclarer' : 'CA à déclarer · estimé'}</p>
        <strong class="fiscal-amount">${money(total)}</strong>
        ${provisional ? `<p class="fiscal-muted">Provisoire au ${dateLabel(now)}</p>` : ''}
        ${settings.includeCosts ? '<p class="fiscal-muted">Frais refacturés inclus</p>' : ''}
      </div>
      <div><div class="fiscal-window"><div><p class="fiscal-muted">Ouverture</p><strong>${dateLabel(window.opening)}</strong></div><div><p class="fiscal-muted">Date limite</p><strong>${dateLabel(window.deadline)}</strong></div></div><span class="fiscal-state ${window.state}">${stateLabel}</span></div>
      <div class="fiscal-actions"><button class="button button-secondary" type="button" data-fiscal-action="copy">Copier</button><button class="button button-secondary" type="button" data-fiscal-action="csv">Exporter CSV</button><button class="button button-secondary" type="button" data-fiscal-action="calendar">Ajouter à l’agenda</button><a class="button button-secondary" href="https://www.autoentrepreneur.urssaf.fr/" target="_blank" rel="noopener noreferrer">Urssaf ↗</a></div>
      <details class="fiscal-details"><summary>Encaissements · ${payments.length}</summary>
        ${payments.length ? `<div class="fiscal-table-wrap"><table class="fiscal-table"><thead><tr><th>Mission</th><th>Client</th><th>Encaissement</th><th>Montant retenu</th></tr></thead><tbody>${payments.map(({ mission, payment, amount }) => `<tr><td>${escape(mission.title)}</td><td>${escape(mission.client)}</td><td>${payment.toLocaleDateString('fr-FR')}</td><td>${money(amount)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="3">Total</th><th>${money(total)}</th></tr></tfoot></table></div>` : '<p class="fiscal-muted">Aucun encaissement enregistré pour ce trimestre.</p>'}
      </details>${issuesMarkup(data.issues)}`;
  }
  function refresh() {
    const now = new Date();
    const missions = getMissions();
    const years = new Set([now.getFullYear(), now.getFullYear() - 1, year]);
    vatPanel.getYears().forEach(value => years.add(value));
    missions.forEach(m => [m.date_payment, m.date_validation].forEach(value => { const date = day(value); if (date && date <= now) years.add(date.getFullYear()); }));
    el('fiscalYear').innerHTML = [...years].sort((a, b) => b - a).map(value => `<option value="${value}" ${value === year ? 'selected' : ''}>${value}</option>`).join('');
    el('fiscalQuarter').value = quarter;
    const maxMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    vatMonth = Math.min(vatMonth, maxMonth);
    el('fiscalMonth').innerHTML = Array.from({ length: maxMonth }, (_, index) => {
      const value = index + 1;
      const label = new Date(year, index, 1).toLocaleDateString('fr-FR', { month: 'long' });
      return `<option value="${value}" ${value === vatMonth ? 'selected' : ''}>${label}</option>`;
    }).join('');
    const settings = settingsFor(year);
    snapshot = summarizeMissions(missions, year, quarter, settings, now);
    renderQuarter(snapshot, settings, now);
    if (activeTab === 'vat') vatPanel.refresh(selectedVatPeriod());
    const period = defaultPeriod(now);
    const declarationOpen = declarationWindow(period.year, period.quarter, now).state === 'open';
    el('fiscalBadge').hidden = !declarationOpen;
    const hint = declarationOpen ? 'Période de déclaration Urssaf ouverte' : '';
    el('openFiscalBtn').title = hint || 'Consulter mes déclarations et mon suivi TVA';
    el('openFiscalBtn').setAttribute('aria-label', `Déclarations et TVA${hint ? ' : ' + hint : ''}`);
  }
  function switchTab(tab) {
    activeTab = tab;
    Object.entries(tabs).forEach(([name, prefix]) => {
      el(prefix + 'Tab').setAttribute('aria-selected', String(name === tab));
      el(prefix + 'Tab').tabIndex = name === tab ? 0 : -1;
      el(prefix + 'Panel').hidden = name !== tab;
    });
    el('fiscalQuarterLabel').hidden = tab !== 'quarter';
    el('fiscalMonthLabel').hidden = tab !== 'vat';
    el('fiscalSettings').hidden = tab === 'vat';
    el('fiscalFeedback').textContent = '';
    if (tab === 'vat') vatPanel.refresh(selectedVatPeriod(), true);
  }
  el('openFiscalBtn').addEventListener('click', () => { refresh(); if (activeTab === 'vat') vatPanel.refresh(selectedVatPeriod(), true); dialog.showModal(); });
  el('closeFiscalBtn').addEventListener('click', () => dialog.close());
  el('fiscalYear').addEventListener('change', event => { year = Number(event.target.value); loadSettings(); refresh(); });
  el('fiscalQuarter').addEventListener('change', event => { quarter = Number(event.target.value); refresh(); });
  el('fiscalMonth').addEventListener('change', event => { vatMonth = Number(event.target.value); refresh(); });
  ['fiscalConfirmed', 'fiscalCosts'].forEach(id => el(id).addEventListener('change', saveSettings));
  Object.entries(tabs).forEach(([name, prefix]) => el(prefix + 'Tab').addEventListener('click', () => switchTab(name)));
  dialog.querySelector('[role=tablist]').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const names = Object.keys(tabs);
    const index = (names.indexOf(activeTab) + (event.key === 'ArrowLeft' ? -1 : 1) + names.length) % names.length;
    switchTab(event.key === 'Home' ? names[0] : event.key === 'End' ? names.at(-1) : names[index]);
    el(tabs[activeTab] + 'Tab').focus();
  });
  dialog.addEventListener('click', async event => {
    const action = event.target.closest('[data-fiscal-action]')?.dataset.fiscalAction;
    if (!action) return;
    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText((snapshot.total / 100).toFixed(2).replace('.', ','));
        el('fiscalFeedback').textContent = 'Montant copié.';
      } catch { el('fiscalFeedback').textContent = `Copie indisponible. Montant : ${money(snapshot.total)}.`; }
    } else if (action === 'csv') {
      download(paymentsCsv(snapshot, settingsFor(year)), 'text/csv;charset=utf-8', `encaissements-${year}-T${quarter}.csv`);
      el('fiscalFeedback').textContent = 'Export CSV demandé.';
    } else {
      download(calendarEvent(year, quarter), 'text/calendar;charset=utf-8', `declaration-${year}-T${quarter}.ics`);
      el('fiscalFeedback').textContent = 'Fichier à importer dans l’agenda · rappel 3 jours avant la fin.';
    }
  });
  loadSettings();
  return { refresh, getVatDue: vatPanel.getVatDue };
}
