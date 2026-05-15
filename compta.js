import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;
let missions = [];
let collapsedGroups = new Set(); // Ex: "2024-Q4"

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

let chartEvolution = null;
let chartGoals = null;
let quarterlyGoals = JSON.parse(localStorage.getItem('quarterlyGoals') || '{}');
let lastFilteredMissions = []; // Pour rafraîchir un seul graph sans l'autre
// Default goals if empty
if (Object.keys(quarterlyGoals).length === 0) {
  quarterlyGoals = { 
    '2024-Q4': 12000, 
    '2025-Q1': 8000, 
    '2025-Q2': 10000, 
    '2025-Q3': 8500, 
    '2025-Q4': 12000,
    '2026-Q1': 12000,
    '2026-Q2': 8000,
    '2026-Q3': 10000,
    '2026-Q4': 8500
  };
}

const monthlyGoals = {
  '2026-01': 4000, '2026-02': 4000, '2026-03': 3500, '2026-04': 3500,
  '2026-05': 3500, '2026-06': 2500, '2026-07': 2750, '2026-08': 2250,
  '2026-09': 3250, '2026-10': 3500, '2026-11': 3500, '2026-12': 2250
};

// === CONSTANTES & CONFIG ===
const URSSAF_RATE = 0.2575;
const IMPOT_ABATTEMENT = 0.66;
const IMPOT_SEUIL = 10777; // Seuil de la tranche à 11% (Barème 2023 utilisé par l'utilisateur)
const IMPOT_TAUX = 0.11;

const STATUS_LABELS = {
  pas_commence: "Pas commencé",
  en_cours: "En cours",
  bloque: "Bloqué",
  terminee: "Terminée",
  payee: "Payée"
};

// === INITIALISATION ===
async function init() {
  if (!supabase) {
    showToast("Supabase n'est pas configuré.", "error");
    return;
  }
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    // Si pas connecté, rediriger vers le dashboard principal pour s'authentifier
    window.location.href = "index.html";
    return;
  }

  await loadData();
  initEventListeners();
  initCharts();
}

async function loadData() {
  const { data, error } = await supabase.from('missions').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error("Erreur de chargement:", error);
    showToast("Erreur lors du chargement des missions", "error");
    return;
  }
  missions = data || [];
  renderAll();
}

function cleanPrice(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  let s = val.toString().replace(/\s/g, '').replace(',', '.');
  return parseFloat(s) || 0;
}

function parseSafeDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length < 3) return new Date(dateStr);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getQuarterKey(date) {
    const year = date.getFullYear();
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `${year}-Q${quarter}`;
}

// === RENDU UI ===
function renderAll() {
  populateKPIFilter();
  renderKPIs();
  renderTable();
}

function renderKPIs() {
  const checkboxes = document.querySelectorAll('.quarter-checkbox:checked');
  const selectedValues = Array.from(checkboxes).map(cb => cb.value);
  const isAll = selectedValues.includes('all');
  
  let caTotal = 0;
  let resteARecevoir = 0;
  let paidURSSAF = 0;
  let paidTurnoverForTax = 0;

  missions.forEach(m => {
    const price = cleanPrice(m.price);
    const dateToUse = m.date_validation || m.date_payment || '';
    const dateObj = parseSafeDate(dateToUse);
    const qKey = dateObj ? getQuarterKey(dateObj) : null;

    const isMatch = isAll || (qKey && selectedValues.includes(qKey));

    if (isMatch) {
      caTotal += price;
      if (m.status !== 'payee') {
        resteARecevoir += price;
      } else {
        // Uniquement pour les missions payées (le solde à avoir)
        paidURSSAF += price * URSSAF_RATE;
        paidTurnoverForTax += price * IMPOT_ABATTEMENT;
      }
    }
  });

  animateCounter('kpi-ca', caTotal);
  animateCounter('kpi-urssaf', caTotal * URSSAF_RATE);
  
  const caApresAbattement = caTotal * IMPOT_ABATTEMENT;
  const impots = Math.max(0, (caApresAbattement - IMPOT_SEUIL) * IMPOT_TAUX);
  animateCounter('kpi-impots', impots);
  animateCounter('kpi-reste', resteARecevoir);

  // Animation du solde combiné au verso de la carte URSSAF
  const paidImpots = Math.max(0, (paidTurnoverForTax - IMPOT_SEUIL) * IMPOT_TAUX);
  animateCounter('soldeTotal', paidURSSAF + paidImpots);

  // === FILTRAGE POUR LES GRAPHIQUES (Par année entière des trimestres sélectionnés) ===
  let chartMissions = [];
  if (isAll) {
    chartMissions = missions;
  } else {
    // On extrait les années uniques des sélections (ex: "2026-Q1" -> "2026")
    const selectedYears = new Set(selectedValues.map(v => v.split('-')[0]));
    chartMissions = missions.filter(m => {
      const dateToUse = m.date_validation || m.date_payment || '';
      const dateObj = parseSafeDate(dateToUse);
      return dateObj && selectedYears.has(dateObj.getFullYear().toString());
    });
  }
  updateCharts(chartMissions);

  // Mettre à jour le label du bouton
  const label = document.getElementById('multiSelectLabel');
  if (isAll) {
    label.textContent = "Tout l'historique";
  } else if (selectedValues.length === 0) {
    label.textContent = "Aucun trimestre";
  } else if (selectedValues.length === 1) {
    const [year, qNum] = selectedValues[0].split('-Q');
    label.textContent = `${year} — T${qNum}`;
  } else {
    label.textContent = `${selectedValues.length} trimestres`;
  }
}

function populateKPIFilter() {
  const dropdown = document.getElementById('multiSelectDropdown');
  if (!dropdown) return;

  // Sauvegarder les sélections actuelles
  const previousSelections = Array.from(document.querySelectorAll('.quarter-checkbox:checked')).map(cb => cb.value);
  
  dropdown.innerHTML = `
    <label class="multi-select-option">
      <input type="checkbox" class="quarter-checkbox" value="all" ${previousSelections.includes('all') ? 'checked' : ''}>
      Tout l'historique
    </label>
  `;

  const quarters = new Set();
  missions.forEach(m => {
    const dateToUse = m.date_validation || m.date_payment || '';
    const dateObj = parseSafeDate(dateToUse);
    if (dateObj) quarters.add(getQuarterKey(dateObj));
  });

  const sortedQuarters = Array.from(quarters).sort().reverse();
  const currentQKey = getQuarterKey(new Date());

  sortedQuarters.forEach(q => {
    const [year, qNum] = q.split('-Q');
    const isChecked = previousSelections.length > 0 ? previousSelections.includes(q) : (q === currentQKey);
    
    const label = document.createElement('label');
    label.className = 'multi-select-option';
    label.innerHTML = `
      <input type="checkbox" class="quarter-checkbox" value="${q}" ${isChecked ? 'checked' : ''}>
      ${year} — Trimestre ${qNum}
    `;
    dropdown.appendChild(label);
  });

  // Ajouter les écouteurs
  dropdown.querySelectorAll('.quarter-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      if (cb.value === 'all' && cb.checked) {
        // Décocher les autres si "Tout" est coché
        dropdown.querySelectorAll('.quarter-checkbox').forEach(other => {
          if (other !== cb) other.checked = false;
        });
      } else if (cb.checked) {
        // Décocher "Tout" si un autre est coché
        const allCb = dropdown.querySelector('input[value="all"]');
        if (allCb) allCb.checked = false;
      }
      renderKPIs();
    });
  });

  // Initialiser le label au premier chargement
  if (previousSelections.length === 0) renderKPIs();
}

function renderTable() {
  const container = document.getElementById('missionsTableBody');
  container.innerHTML = '';

  if (missions.length === 0) {
    container.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 2rem; color: var(--text-muted)">Aucune mission trouvée</td></tr>';
    return;
  }

  // 1. Groupement des missions
  const groups = {};
  missions.forEach(m => {
    // Utiliser la date de validation en priorité, sinon la date de paiement, sinon la date de création
    let date = null;
    if (m.date_validation) date = parseSafeDate(m.date_validation);
    else if (m.date_payment) date = parseSafeDate(m.date_payment);
    else date = new Date(m.created_at);

    const key = getQuarterKey(date);
    const year = date.getFullYear();
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    
    if (!groups[key]) groups[key] = { year, quarter, items: [], total: 0 };
    groups[key].items.push(m);
    groups[key].total += cleanPrice(m.price);
  });

  // 2. Tri des groupes par date décroissante
  const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  
  // 3. Initialisation des groupes repliés par défaut (sauf le plus récent)
  if (collapsedGroups.size === 0 && sortedKeys.length > 1) {
    sortedKeys.slice(1).forEach(key => collapsedGroups.add(key));
  }

  sortedKeys.forEach(key => {
    const group = groups[key];
    const isCollapsed = collapsedGroups.has(key);
    
    // Trier les missions au sein du groupe par date décroissante (plus récent en haut)
    // On utilise la même logique de priorité de date pour le tri
    group.items.sort((a, b) => {
        const dateA = a.date_payment ? new Date(a.date_payment) : (a.date_validation ? new Date(a.date_validation) : new Date(a.created_at));
        const dateB = b.date_payment ? new Date(b.date_payment) : (b.date_validation ? new Date(b.date_validation) : new Date(b.created_at));
        return dateB - dateA;
    });
    
    // Header de groupe
    const headerRow = document.createElement('tr');
    headerRow.className = 'group-header';
    headerRow.style.cursor = 'pointer';
    headerRow.style.background = 'var(--surface-2)';
    headerRow.innerHTML = `
      <td colspan="10" style="padding: 0.75rem 1rem; border-left: 4px solid var(--blue)">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 700; display: flex; align-items: center; gap: 0.5rem;">
            ${isCollapsed ? '▶' : '▼'} ${group.year} — Trimestre ${group.quarter} 
            <small style="font-weight: 400; color: var(--text-muted); margin-left: 1rem;">(${group.items.length} missions)</small>
          </span>
          <span style="font-weight: 600; color: var(--blue)">Total : ${formatCurrency(group.total)}</span>
        </div>
      </td>
    `;
    headerRow.onclick = () => {
      if (collapsedGroups.has(key)) collapsedGroups.delete(key);
      else collapsedGroups.add(key);
      renderTable();
    };
    container.appendChild(headerRow);

    // Missions du groupe
    if (!isCollapsed) {
      group.items.forEach(m => {
        let isLate = false;
        if (m.status === 'terminee' && m.date_validation) {
            const valDate = new Date(m.date_validation);
            const diffDays = (new Date() - valDate) / (1000 * 60 * 60 * 24);
            if (diffDays > 30) isLate = true;
        }

        const tr = document.createElement('tr');
        tr.className = 'mission-row';
        tr.style.cursor = 'pointer';
        tr.dataset.id = m.id;
        tr.innerHTML = `
          <td class="col-task"><strong>${escapeHTML(m.title)}</strong></td>
          <td>${escapeHTML(m.client || '')}</td>
          <td>${escapeHTML(m.entity || '')}</td>
          <td>${m.quote_accepted ? '✅' : (m.quote_sent ? 'Envoyé' : '❌')}</td>
          <td class="${isLate ? 'late-payment' : ''}">${formatCurrency(m.price)} ${isLate ? '🚨' : ''}</td>
          <td style="color:var(--text-muted)">${m.debours > 0 ? formatCurrency(m.debours) : '-'}</td>
          <td>${m.date_validation ? new Date(m.date_validation).toLocaleDateString('fr-FR') : '-'}</td>
          <td>${m.date_payment ? new Date(m.date_payment).toLocaleDateString('fr-FR') : '-'}</td>
          <td><span class="status-badge status-${m.status}">${STATUS_LABELS[m.status]}</span></td>
          <td>
            <button class="icon-button edit-btn" data-id="${m.id}" title="Éditer">
              <svg class="icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-button delete-btn" data-id="${m.id}" title="Supprimer">
              <svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        `;
        container.appendChild(tr);
      });
    }
  });
}



// === ACTIONS & EVENTS ===
function initEventListeners() {
  const multiBtn = document.querySelector('.multi-select-btn');
  const multiDropdown = document.getElementById('multiSelectDropdown');
  
  if (multiBtn) {
    multiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      multiDropdown.classList.toggle('show');
    });
  }

  const syncBtn = document.getElementById('syncQontoBtn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      try {
        syncBtn.innerHTML = '<svg class="icon rotating" viewBox="0 0 24 24"><path d="M20 11a8.1 8.1 0 0 0-15.5-2m-.5 5v-5h5M4 13a8.1 8.1 0 0 0 15.5 2m.5-5v5h-5"/></svg>';
        
        const { data, error } = await supabase.functions.invoke('sync-qonto');
        
        if (error) {
          console.error("Erreur retournée par la fonction:", error);
          throw error;
        }
        
        if (data.results.matched > 0) {
          showToast(`${data.results.matched} mission(s) marquée(s) comme payée(s) !`, "success");
          await loadData();
        } else {
          showToast("Aucun nouveau paiement détecté.", "info");
        }
      } catch (err) {
        console.error("Erreur complète sync Qonto:", err);
        showToast("Erreur lors de la synchronisation Qonto", "error");
      } finally {
        syncBtn.disabled = false;
        syncBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M20 11a8.1 8.1 0 0 0-15.5-2m-.5 5v-5h5M4 13a8.1 8.1 0 0 0 15.5 2m.5-5v5h-5"/></svg>';
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (multiDropdown && !multiDropdown.contains(e.target) && !multiBtn.contains(e.target)) {
      multiDropdown.classList.remove('show');
    }
    
    // Fermer les dialogs (modales) si on clique sur le backdrop
    if (e.target.tagName === 'DIALOG') {
      e.target.close();
    }
  });

  document.getElementById('addMissionBtn').addEventListener('click', () => {
    document.getElementById('missionForm').reset();
    document.getElementById('missionId').value = "";
    document.getElementById('missionDialogTitle').textContent = "Nouvelle Mission";
    document.getElementById('missionDialog').showModal();
  });

  document.getElementById('closeMissionDialog').addEventListener('click', () => {
    document.getElementById('missionDialog').close();
  });

  document.getElementById('missionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('missionId').value;
    const missionData = {
      title: document.getElementById('missionTitle').value,
      client: document.getElementById('missionClient').value,
      entity: document.getElementById('missionEntity').value,
      contact: document.getElementById('missionContact').value,
      price: document.getElementById('missionPrice').value || 0,
      debours: document.getElementById('missionDebours').value || 0,
      date_validation: document.getElementById('missionDateValidation').value || null,
      date_payment: document.getElementById('missionDatePayment').value || null,
      status: document.getElementById('missionStatus').value,
      quote_sent: document.getElementById('missionQuoteSent').checked,
      quote_accepted: document.getElementById('missionQuoteAccepted').checked,
      notes: document.getElementById('missionNotes').value,
      external_ref: document.getElementById('missionExternalRef').value
    };

    // Auto update payee -> fill date if empty
    if (missionData.status === 'payee' && !missionData.date_payment) {
      missionData.date_payment = new Date().toISOString().split('T')[0];
    }
    // Auto status payee if date_payment is filled
    if (missionData.date_payment && missionData.status !== 'payee') {
        missionData.status = 'payee';
    }

    if (id) {
      const { error } = await supabase.from('missions').update(missionData).eq('id', id);
      if (error) showToast("Erreur lors de la modification", "error");
      else showToast("Mission modifiée !");
    } else {
      const { error } = await supabase.from('missions').insert([missionData]);
      if (error) showToast("Erreur lors de l'ajout", "error");
      else showToast("Mission ajoutée !");
    }

    document.getElementById('missionDialog').close();
    loadData();
  });

  document.getElementById('missionsTableBody').addEventListener('click', async (e) => {
    // Si on clique sur le bouton supprimer, on arrête la propagation pour ne pas ouvrir le mode édition
    if (e.target.closest('.delete-btn')) return;

    const row = e.target.closest('.mission-row');
    const editBtn = e.target.closest('.edit-btn');
    const targetId = editBtn ? editBtn.dataset.id : (row ? row.dataset.id : null);

    if (targetId) {
      const m = missions.find(x => x.id === targetId);
      if (m) {
        document.getElementById('missionId').value = m.id;
        document.getElementById('missionTitle').value = m.title;
        document.getElementById('missionClient').value = m.client || "";
        document.getElementById('missionEntity').value = m.entity || "";
        document.getElementById('missionContact').value = m.contact || "";
        document.getElementById('missionPrice').value = m.price || 0;
        document.getElementById('missionDebours').value = m.debours || 0;
        document.getElementById('missionDateValidation').value = m.date_validation || "";
        document.getElementById('missionDatePayment').value = m.date_payment || "";
        document.getElementById('missionStatus').value = m.status;
        document.getElementById('missionQuoteSent').checked = m.quote_sent;
        document.getElementById('missionQuoteAccepted').checked = m.quote_accepted;
        document.getElementById('missionNotes').value = m.notes || "";
        document.getElementById('missionExternalRef').value = m.external_ref || "";
        
        document.getElementById('missionDialogTitle').textContent = "Modifier la mission";
        document.getElementById('missionDialog').showModal();
      }
    }

    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
      if (confirm("Supprimer cette mission ?")) {
        await supabase.from('missions').delete().eq('id', deleteBtn.dataset.id);
        loadData();
      }
    }
  });
  
  // Graphiques & Objectifs
  document.getElementById('toggleChartsBtn').addEventListener('click', (e) => {
    const section = document.getElementById('chartsSection');
    const isShowing = section.classList.toggle('show');
    e.currentTarget.innerHTML = isShowing 
      ? `<svg class="icon" viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg> Masquer les graphiques`
      : `<svg class="icon" viewBox="0 0 24 24"><path d="M3 3v18h18M18 17l-4-4-4 4-4-4"/></svg> Afficher les graphiques`;
    if (isShowing) renderKPIs(); // Refresh graphs on show
  });

  document.getElementById('openGoalsBtn').addEventListener('click', () => {
    renderGoalsInputs();
    document.getElementById('goalsDialog').showModal();
  });

  document.getElementById('closeGoalsDialog').addEventListener('click', () => {
    document.getElementById('goalsDialog').close();
  });

  document.getElementById('saveGoalsBtn').addEventListener('click', () => {
    const inputs = document.querySelectorAll('.goal-input');
    inputs.forEach(input => {
      quarterlyGoals[input.dataset.quarter] = parseFloat(input.value) || 0;
    });
    localStorage.setItem('quarterlyGoals', JSON.stringify(quarterlyGoals));
    document.getElementById('goalsDialog').close();
    renderKPIs();
    showToast("Objectifs mis à jour !");
  });

  const toggleGoal = document.getElementById('toggleMonthlyGoal');
  if (toggleGoal) {
    toggleGoal.addEventListener('change', () => {
      updateEvolutionChart(lastFilteredMissions);
    });
  }
}

function renderGoalsInputs() {
  const container = document.getElementById('goalsInputsContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // Générer la liste des trimestres de 2024 jusqu'à l'année prochaine (pour planning)
  const quartersToShow = [];
  for (let y = currentYear + 1; y >= 2024; y--) {
    for (let q = 4; q >= 1; q--) {
      // Optionnel : on peut limiter à 2024-Q4 si c'est le début réel
      if (y === 2024 && q < 4) continue;
      quartersToShow.push(`${y}-Q${q}`);
    }
  }
  
  quartersToShow.forEach(key => {
    const value = quarterlyGoals[key] || 0;
    const [year, q] = key.split('-');
    
    const div = document.createElement('div');
    div.className = 'goal-input-group';
    div.innerHTML = `
      <label>${year} — ${q.replace('Q', 'T')}</label>
      <input type="number" class="goal-input" value="${value}" data-quarter="${key}" placeholder="0">
    `;
    container.appendChild(div);
  });
}

// === CHARTS LOGIC ===
function initCharts() {
  const ctxEvolution = document.getElementById('chartEvolution').getContext('2d');
  const ctxGoals = document.getElementById('chartGoals').getContext('2d');

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#8f8f8f', usePointStyle: true, boxWidth: 6 }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#666' } },
      y: { 
        grid: { color: 'rgba(255,255,255,0.05)' }, 
        ticks: { 
          color: '#666',
          callback: function(value) {
            if (value % 1000 === 0) return (value / 1000) + 'k';
            return null;
          }
        } 
      }
    }
  };

  chartEvolution = new Chart(ctxEvolution, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      ...commonOptions,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        ...commonOptions.plugins,
        tooltip: {
          backgroundColor: '#111',
          titleColor: '#fff',
          bodyColor: '#ccc',
          borderColor: '#333',
          borderWidth: 1
        }
      }
    }
  });

  chartGoals = new Chart(ctxGoals, {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: {
      ...commonOptions,
      plugins: {
        ...commonOptions.plugins,
        tooltip: { enabled: true }
      }
    }
  });
}

function updateCharts(filteredMissions) {
  lastFilteredMissions = filteredMissions;
  updateEvolutionChart(filteredMissions);
  updateGoalsChart(filteredMissions);
}

function updateEvolutionChart(filteredMissions) {
  if (!chartEvolution) return;

  const monthlyData = {};
  filteredMissions.forEach(m => {
    const dateToUse = m.date_validation || m.date_payment || '';
    const dateObj = parseSafeDate(dateToUse);
    if (!dateObj) return;
    
    const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = dateObj.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    
    if (!monthlyData[monthKey]) monthlyData[monthKey] = { label: monthLabel, ca: 0 };
    monthlyData[monthKey].ca += cleanPrice(m.price);
  });

  const sortedMonthKeys = Object.keys(monthlyData).sort();
  if (sortedMonthKeys.length === 0) {
    chartEvolution.data.labels = [];
    chartEvolution.data.datasets = [];
    chartEvolution.update();
  } else {
    const evolutionLabels = sortedMonthKeys.map(k => monthlyData[k].label);
    const evolutionCA = sortedMonthKeys.map(k => monthlyData[k].ca);
    const evolutionNet = evolutionCA.map(ca => ca * 0.7);
    const evolutionGoals = sortedMonthKeys.map(k => monthlyGoals[k] || 0);

    const datasets = [
      {
        label: 'CA',
        data: evolutionCA,
        borderColor: '#3291ff',
        backgroundColor: 'rgba(50, 145, 255, 0.1)',
        borderWidth: 3,
        tension: 0.4,
        fill: true,
        pointRadius: 2
      }
    ];

    if (document.getElementById('toggleMonthlyGoal')?.checked) {
      datasets.push({
        label: 'Objectif',
        data: evolutionGoals,
        borderColor: 'rgba(229, 62, 62, 0.7)',
        borderDash: [2, 2],
        borderWidth: 1.5,
        tension: 0,
        pointRadius: 0,
        fill: false
      });
    }

    datasets.push({
      label: 'Net',
      data: evolutionNet,
      borderColor: 'rgba(255, 255, 255, 0.2)',
      borderDash: [5, 5],
      borderWidth: 1.5,
      tension: 0.4,
      pointRadius: 0
    });

    chartEvolution.data.labels = evolutionLabels;
    chartEvolution.data.datasets = datasets;
    chartEvolution.update();

    // Mise à jour de l'indicateur de net moyen
    const avgNetEl = document.getElementById('avgNetMois');
    if (avgNetEl) {
      if (document.getElementById('toggleMonthlyGoal')?.checked && evolutionNet.length > 0) {
        const avg = evolutionNet.reduce((a, b) => a + b, 0) / evolutionNet.length;
        avgNetEl.textContent = `Net moyen : ${formatCurrency(avg)} / mois`;
        avgNetEl.style.display = 'block';
      } else {
        avgNetEl.style.display = 'none';
      }
    }
  }
}

function updateGoalsChart(filteredMissions) {
  if (!chartGoals) return;

  const quarterlyData = {};
  filteredMissions.forEach(m => {
    const dateToUse = m.date_validation || m.date_payment || '';
    const dateObj = parseSafeDate(dateToUse);
    if (!dateObj) return;
    
    const qKey = getQuarterKey(dateObj);
    if (!quarterlyData[qKey]) quarterlyData[qKey] = 0;
    quarterlyData[qKey] += cleanPrice(m.price);
  });

  const sortedQKeys = Object.keys(quarterlyData).sort();
  if (sortedQKeys.length === 0) {
    chartGoals.data.labels = [];
    chartGoals.data.datasets = [];
    chartGoals.update();
  } else {
    const qLabels = sortedQKeys.map(k => k.replace('-Q', ' T'));
    const qCA = sortedQKeys.map(k => quarterlyData[k]);
    const qGoals = sortedQKeys.map(k => quarterlyGoals[k] || 0);

    chartGoals.data.labels = qLabels;
    chartGoals.data.datasets = [
      {
        label: 'CA réalisé',
        data: qCA,
        backgroundColor: 'rgba(47, 133, 90, 0.6)',
        borderRadius: 4,
        barThickness: 30
      },
      {
        label: 'Objectif CA',
        data: qGoals,
        type: 'line',
        borderColor: '#e53e3e',
        borderWidth: 2,
        pointBackgroundColor: '#e53e3e',
        pointRadius: 4,
        tension: 0
      }
    ];
    chartGoals.update();
  }
}

// === UTILS ===
function animateCounter(elementId, targetValue) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const startValue = parseFloat(el.dataset.currentValue || 0);
  if (startValue === targetValue) {
    el.textContent = formatCurrency(targetValue);
    return;
  }
  
  el.dataset.currentValue = targetValue;
  const duration = 1000; // 1 seconde
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing smooth
    const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    const currentValue = startValue + (targetValue - startValue) * easeProgress;
    
    if (progress < 1) {
      let formatted = formatCurrency(currentValue);
      
      // On fait défiler des chiffres aléatoires pour l'effet "roulette"
      formatted = formatted.split('').map(char => {
        if (/[0-9]/.test(char) && Math.random() > 0.5) {
          return Math.floor(Math.random() * 10).toString();
        }
        return char;
      }).join('');
      
      el.textContent = formatted;
      requestAnimationFrame(update);
    } else {
      el.textContent = formatCurrency(targetValue);
    }
  }
  
  requestAnimationFrame(update);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

function escapeHTML(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#2f855a' : type === 'error' ? '#c53030' : '#2b6cb0'};
        color: white;
        border-radius: 4px;
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);
        z-index: 2000;
        animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Lancer l'init
init();
