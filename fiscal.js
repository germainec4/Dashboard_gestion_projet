import './fiscal.css';
import { cents, day, defaultPeriod, declarationWindow, summarizeMissions, calendarEvent, paymentsCsv } from './fiscal-model.js';

const money = value => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value / 100);
const dateLabel = date => date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const defaults = { confirmed: false, includeCosts: false, base: 37500, upper: 41250 };

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

export function initFiscalPanel(getMissions, userId) {
  const el = id => document.getElementById(id);
  const dialog = el('fiscalDialog');
  const initial = defaultPeriod();
  let year = initial.year;
  let quarter = initial.quarter;
  let activeTab = 'quarter';
  let snapshot;
  let simulateCommitted = false;
  let simulatePotential = false;
  const settingsByYear = new Map();
  const key = selected => `fiscal-settings-v1:${userId}:${selected}`;
  function settingsFor(selected) {
    if (!settingsByYear.has(selected)) {
      let stored = {};
      try { stored = JSON.parse(localStorage.getItem(key(selected)) || '{}') || {}; } catch { /* Defaults remain usable. */ }
      const base = Number(stored.base) >= 1 ? Number(stored.base) : defaults.base;
      const upper = Number(stored.upper) > base ? Number(stored.upper) : Math.max(defaults.upper, base * 1.1);
      settingsByYear.set(selected, {
        confirmed: stored.confirmed === true, includeCosts: stored.includeCosts === true,
        base, upper
      });
    }
    return settingsByYear.get(selected);
  }
  function loadSettings() {
    const settings = settingsFor(year);
    el('fiscalConfirmed').checked = settings.confirmed;
    el('fiscalCosts').checked = settings.includeCosts;
    el('fiscalBase').value = settings.base;
    el('fiscalUpper').value = settings.upper;
    el('fiscalUpper').setCustomValidity('');
  }
  function saveSettings() {
    const base = Number(el('fiscalBase').value);
    const upper = Number(el('fiscalUpper').value);
    el('fiscalUpper').setCustomValidity(upper > base ? '' : 'Le seuil majoré doit être supérieur au seuil de base.');
    if (!el('fiscalBase').reportValidity() || !el('fiscalUpper').reportValidity()) return;
    const settings = { confirmed: el('fiscalConfirmed').checked, includeCosts: el('fiscalCosts').checked, base, upper };
    settingsByYear.set(year, settings);
    try {
      localStorage.setItem(key(year), JSON.stringify(settings));
      el('fiscalFeedback').textContent = 'Paramètres enregistrés sur ce navigateur.';
    } catch { el('fiscalFeedback').textContent = 'Paramètres appliqués pour cette session ; enregistrement local indisponible.'; }
    refresh();
  }
  function issuesMarkup(issues) {
    if (!issues.length) return '';
    return `<details class="fiscal-details"><summary>${issues.length} mission(s) à vérifier, exclue(s) des calculs</summary><p class="fiscal-muted">Toutes périodes confondues : une date manquante ne permet pas de rattacher la mission à un trimestre.</p><ul>${issues.map(({ mission, reason }) => `<li>${escape(mission.title)} — ${escape(reason)}</li>`).join('')}</ul></details>`;
  }
  function renderQuarter(data, settings, now) {
    const { window, payments, total } = data;
    const stateLabel = { upcoming: 'À venir', open: 'Déclaration ouverte', closed: 'Période terminée' }[window.state];
    const provisional = now < window.opening;
    el('fiscalQuarterPanel').innerHTML = `
      <div class="fiscal-hero"><p class="section-kicker">${settings.confirmed && !data.issues.length ? 'CA encaissé HT à déclarer' : 'CA encaissé estimé · base à vérifier'}</p>
        <strong class="fiscal-amount">${money(total)}</strong>
        <p class="fiscal-muted">Encaissements du ${dateLabel(window.start)} au ${dateLabel(window.end)} · ${payments.length} mission(s)</p>
        <p class="fiscal-muted">${provisional ? `Provisoire au ${dateLabel(now)}` : 'Selon les paiements enregistrés'} · ${settings.includeCosts ? 'Frais refacturés ajoutés' : 'Champ « Prix (CA) » uniquement'}</p>
      </div>
      <div><div class="fiscal-window"><div><p class="fiscal-muted">Ouverture de la déclaration</p><strong>${dateLabel(window.opening)}</strong></div><div><p class="fiscal-muted">Dernier jour pour déclarer et payer</p><strong>${dateLabel(window.deadline)}</strong></div></div><span class="fiscal-state ${window.state}">${stateLabel}</span></div>
      ${!settings.confirmed ? '<p class="fiscal-notice">Vérifiez la base de calcul ci-dessous : montants HT, frais et éventuels acomptes. Le total couvre uniquement les missions enregistrées.</p>' : ''}
      <div class="fiscal-actions"><button class="button button-secondary" type="button" data-fiscal-action="copy">Copier le montant</button><button class="button button-secondary" type="button" data-fiscal-action="csv">Exporter le détail</button><button class="button button-secondary" type="button" data-fiscal-action="calendar">Ajouter à mon agenda</button><a class="button button-secondary" href="https://www.autoentrepreneur.urssaf.fr/" target="_blank" rel="noopener noreferrer">Ouvrir l’Urssaf ↗</a></div>
      <details class="fiscal-details"><summary>Détail des encaissements · ${payments.length} mission(s)</summary>
        ${payments.length ? `<div class="fiscal-table-wrap"><table class="fiscal-table"><thead><tr><th>Mission</th><th>Client</th><th>Encaissement</th><th>Montant retenu</th></tr></thead><tbody>${payments.map(({ mission, payment, amount }) => `<tr><td>${escape(mission.title)}</td><td>${escape(mission.client)}</td><td>${payment.toLocaleDateString('fr-FR')}</td><td>${money(amount)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="3">Total</th><th>${money(total)}</th></tr></tfoot></table></div>` : '<p class="fiscal-muted">Aucun encaissement enregistré pour ce trimestre.</p>'}
      </details>${issuesMarkup(data.issues)}
      <p class="fiscal-muted">La date d’encaissement détermine le trimestre, même si le devis a été validé auparavant. La fin de la période de déclaration ne signifie pas que vous avez déclaré ; aucun envoi automatique n’est effectué.</p>`;
  }
  function renderAnnual(data, settings, now) {
    const base = cents(settings.base);
    const upper = cents(settings.upper);
    const current = year === now.getFullYear();
    const projected = data.annual + (current && simulateCommitted ? data.committed : 0) + (current && simulatePotential ? data.potential : 0);
    const message = data.annual > upper ? 'Seuil majoré dépassé dans ce suivi : vérifiez la date de sortie de franchise avec votre SIE.'
      : data.previous > base ? `Le CA enregistré en ${year - 1} dépasse le seuil de base : vérifiez votre situation TVA dès le début de ${year}.`
      : data.annual > base ? 'Seuil de base dépassé dans ce suivi : anticipez la TVA pour l’année suivante et surveillez le seuil majoré.'
      : `Marge jusqu’au seuil de base : ${money(base - data.annual)}.`;
    el('fiscalAnnualPanel').innerHTML = `
      <div class="fiscal-hero"><p class="section-kicker">CA encaissé ${year}</p><strong class="fiscal-amount">${money(data.annual)}</strong><p class="fiscal-muted">Du 1er janvier ${year} ${current ? `au ${dateLabel(now)}` : `au 31 décembre ${year}`} · ${settings.confirmed ? 'base confirmée par vos soins' : 'base de calcul à vérifier'}</p>
        <div class="fiscal-meter" role="meter" aria-label="CA encaissé comparé au seuil majoré de TVA" aria-valuemin="0" aria-valuemax="${upper / 100}" aria-valuenow="${Math.min(data.annual, upper) / 100}" aria-valuetext="${money(data.annual)} sur ${money(upper)}"><span class="fiscal-meter-fill" style="width:${Math.min(100, data.annual / upper * 100)}%"></span><span class="fiscal-meter-mark" style="left:${Math.min(100, base / upper * 100)}%"></span></div>
        <div class="fiscal-limits"><span>Seuil de base · ${money(base)}</span><span>Seuil majoré · ${money(upper)}</span></div>
      </div><p class="fiscal-notice">${message}<br>Marge jusqu’au seuil majoré : ${money(Math.max(0, upper - data.annual))}.</p>
      <p class="fiscal-muted">CA encaissé ${year - 1} enregistré : <strong>${money(data.previous)}</strong>. Vérifiez que l’historique est complet. Les seuils sont ceux des paramètres de l’année sélectionnée.</p>
      ${current ? `<div class="fiscal-stats"><div class="fiscal-stat"><p class="fiscal-muted">Déjà encaissé</p><strong>${money(data.annual)}</strong></div><div class="fiscal-stat"><p class="fiscal-muted">Accepté · à encaisser</p><strong>${money(data.committed)}</strong></div><div class="fiscal-stat"><p class="fiscal-muted">Envoyé · non accepté</p><strong>${money(data.potential)}</strong></div></div>
      <div class="fiscal-details"><p><strong>Anticiper les prochains encaissements</strong></p><label class="fiscal-check"><input data-simulate="committed" type="checkbox" ${simulateCommitted ? 'checked' : ''}>Inclure les missions acceptées non payées</label><label class="fiscal-check"><input data-simulate="potential" type="checkbox" ${simulatePotential ? 'checked' : ''}>Inclure aussi les devis envoyés non acceptés</label><p><strong>Scénario : ${money(projected)}</strong></p><p class="fiscal-muted">${projected > upper ? 'Ce scénario dépasse le seuil majoré.' : projected > base ? 'Ce scénario dépasse le seuil de base.' : `Marge du scénario jusqu’au seuil de base : ${money(base - projected)}.`} Hypothèse : tous les montants cochés sont encaissés avant le 31 décembre. Les missions en attente sont prises toutes dates confondues, sans double compte ; aucune date de dépassement n’est prédite.</p></div>` : '<p class="fiscal-muted">Les projections à partir des devis actuels sont disponibles uniquement pour l’année en cours.</p>'}
      <details class="fiscal-details"><summary>Comprendre les seuils et anticiper mes devis</summary><p class="fiscal-muted">En franchise de TVA, un dépassement du seuil de base entraîne normalement la TVA l’année suivante ; un dépassement du seuil majoré entraîne la sortie dès le jour du dépassement. Cette jauge est un suivi sur encaissements : la base fiscale applicable et la date de réalisation des prestations doivent être vérifiées avec votre service des impôts des entreprises (SIE). Un devis en attente ne déclenche pas la TVA à lui seul. La TVA applicable aux opérations doit être déterminée avant de modifier les devis et factures. Les seuils sont distincts du plafond du régime micro.</p></details>
      ${issuesMarkup(data.issues)}`;
  }
  function refresh() {
    const now = new Date();
    const missions = getMissions();
    const years = new Set([now.getFullYear(), now.getFullYear() - 1, year]);
    missions.forEach(m => [m.date_payment, m.date_validation].forEach(value => { const date = day(value); if (date && date <= now) years.add(date.getFullYear()); }));
    el('fiscalYear').innerHTML = [...years].sort((a, b) => b - a).map(value => `<option value="${value}" ${value === year ? 'selected' : ''}>${value}</option>`).join('');
    el('fiscalQuarter').value = quarter;
    const settings = settingsFor(year);
    snapshot = summarizeMissions(missions, year, quarter, settings, now);
    renderQuarter(snapshot, settings, now);
    renderAnnual(snapshot, settings, now);
    const currentSettings = settingsFor(now.getFullYear());
    const currentData = summarizeMissions(missions, now.getFullYear(), 1, currentSettings, now);
    const period = defaultPeriod(now);
    const declarationOpen = declarationWindow(period.year, period.quarter, now).state === 'open';
    const taxAlert = currentData.annual >= cents(currentSettings.base) * .9 || currentData.previous > cents(currentSettings.base)
      || currentData.annual + currentData.committed > cents(currentSettings.upper);
    el('fiscalBadge').hidden = !declarationOpen && !taxAlert;
    const hint = [declarationOpen && 'Période de déclaration ouverte', taxAlert && 'Seuil TVA à surveiller'].filter(Boolean).join(' · ');
    el('openFiscalBtn').title = hint || 'Consulter mes déclarations et mon suivi TVA';
    el('openFiscalBtn').setAttribute('aria-label', `Déclarations et TVA${hint ? ' : ' + hint : ''}`);
  }
  function switchTab(tab) {
    activeTab = tab;
    ['quarter', 'annual'].forEach(name => {
      const prefix = name === 'quarter' ? 'fiscalQuarter' : 'fiscalAnnual';
      el(prefix + 'Tab').setAttribute('aria-selected', String(name === tab));
      el(prefix + 'Tab').tabIndex = name === tab ? 0 : -1;
      el(prefix + 'Panel').hidden = name !== tab;
    });
    el('fiscalQuarterLabel').hidden = tab !== 'quarter';
  }
  el('openFiscalBtn').addEventListener('click', () => { refresh(); dialog.showModal(); });
  el('closeFiscalBtn').addEventListener('click', () => dialog.close());
  el('fiscalYear').addEventListener('change', event => { year = Number(event.target.value); loadSettings(); refresh(); });
  el('fiscalQuarter').addEventListener('change', event => { quarter = Number(event.target.value); refresh(); });
  ['fiscalConfirmed', 'fiscalCosts', 'fiscalBase', 'fiscalUpper'].forEach(id => el(id).addEventListener('change', saveSettings));
  ['fiscalQuarterTab', 'fiscalAnnualTab'].forEach((id, index) => el(id).addEventListener('click', () => switchTab(index ? 'annual' : 'quarter')));
  dialog.querySelector('[role=tablist]').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    switchTab(event.key === 'Home' ? 'quarter' : event.key === 'End' ? 'annual' : activeTab === 'quarter' ? 'annual' : 'quarter');
    el(activeTab === 'quarter' ? 'fiscalQuarterTab' : 'fiscalAnnualTab').focus();
  });
  el('fiscalAnnualPanel').addEventListener('change', event => {
    if (!event.target.dataset.simulate) return;
    if (event.target.dataset.simulate === 'committed') simulateCommitted = event.target.checked;
    else simulatePotential = event.target.checked;
    renderAnnual(snapshot, settingsFor(year), new Date());
    el('fiscalAnnualPanel').querySelector(`[data-simulate="${event.target.dataset.simulate}"]`).focus();
  });
  dialog.addEventListener('click', async event => {
    const action = event.target.closest('[data-fiscal-action]')?.dataset.fiscalAction;
    if (!action) return;
    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText((snapshot.total / 100).toFixed(2).replace('.', ','));
        el('fiscalFeedback').textContent = 'Montant copié. Vérifiez la base et les éventuelles missions manquantes avant de déclarer.';
      } catch { el('fiscalFeedback').textContent = `Copie indisponible. Montant : ${money(snapshot.total)}.`; }
    } else if (action === 'csv') {
      download(paymentsCsv(snapshot, settingsFor(year)), 'text/csv;charset=utf-8', `encaissements-${year}-T${quarter}.csv`);
      el('fiscalFeedback').textContent = 'Export CSV demandé : détail des encaissements et base de calcul sélectionnée.';
    } else {
      download(calendarEvent(year, quarter), 'text/calendar;charset=utf-8', `declaration-${year}-T${quarter}.ics`);
      el('fiscalFeedback').textContent = 'Importez le fichier dans votre agenda : fenêtre de déclaration complète et rappel 3 jours avant sa fin (selon votre application).';
    }
  });
  loadSettings();
  return { refresh };
}
