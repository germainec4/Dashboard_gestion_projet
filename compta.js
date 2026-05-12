import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;
let missions = [];
let collapsedGroups = new Set(); // Ex: "2024-Q4"

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// === CONSTANTES & CONFIG ===
const URSSAF_RATE = 0.2575;
const IMPOT_ABATTEMENT = 0.66;
const IMPOT_SEUIL = 11600;
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
  const filterVal = document.getElementById('kpiQuarterFilter').value;
  
  let caTotal = 0;
  let resteARecevoir = 0;

  missions.forEach(m => {
    const price = cleanPrice(m.price);
    const dateToUse = m.date_payment || m.date_validation || '';
    const dateObj = parseSafeDate(dateToUse);
    const qKey = dateObj ? getQuarterKey(dateObj) : null;

    // Logique de filtrage
    const isMatch = (filterVal === 'all') || (qKey === filterVal);

    if (isMatch) {
      if (m.status === 'payee') {
        caTotal += price;
      } else {
        resteARecevoir += price;
      }
    }
  });

  // Calculs taxes
  const urssaf = caTotal * URSSAF_RATE;
  const caApresAbattement = caTotal * IMPOT_ABATTEMENT;
  const impots = caApresAbattement > IMPOT_SEUIL ? caApresAbattement * IMPOT_TAUX : 0;

  document.getElementById('kpi-ca').textContent = formatCurrency(caTotal);
  document.getElementById('kpi-urssaf').textContent = formatCurrency(urssaf);
  document.getElementById('kpi-impots').textContent = formatCurrency(impots);
  document.getElementById('kpi-reste').textContent = formatCurrency(resteARecevoir);
}

function populateKPIFilter() {
  const select = document.getElementById('kpiQuarterFilter');
  if (!select) return;

  // Sauvegarder la valeur actuelle si elle existe
  const currentVal = select.value;
  
  // Vider sauf "Tout"
  select.innerHTML = '<option value="all">Tout l\'historique</option>';

  const quarters = new Set();
  missions.forEach(m => {
    const dateToUse = m.date_payment || m.date_validation || '';
    const dateObj = parseSafeDate(dateToUse);
    if (dateObj) {
      quarters.add(getQuarterKey(dateObj));
    }
  });

  const sortedQuarters = Array.from(quarters).sort().reverse();
  
  const now = new Date();
  const currentQKey = getQuarterKey(now);

  sortedQuarters.forEach(q => {
    const option = document.createElement('option');
    option.value = q;
    const [year, qNum] = q.split('-Q');
    option.textContent = `${year} — Trimestre ${qNum}`;
    select.appendChild(option);
  });

  // Par défaut au trimestre actuel s'il existe dans les données, sinon garder le précédent ou "all"
  if (currentVal && currentVal !== 'all') {
    select.value = currentVal;
  } else if (quarters.has(currentQKey)) {
    select.value = currentQKey;
  }
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
    // Utiliser la date de paiement en priorité, sinon la date de validation, sinon la date de création
    let date = null;
    if (m.date_payment) date = parseSafeDate(m.date_payment);
    else if (m.date_validation) date = parseSafeDate(m.date_validation);
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
  document.getElementById('kpiQuarterFilter').addEventListener('change', renderKPIs);
  
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
      notes: document.getElementById('missionNotes').value
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
  
  // CSV Import Mock
  document.getElementById('importCsvBtn').addEventListener('click', () => {
    alert("Pour importer les 90 lignes, nous pourrons ajouter un fichier script d'import plus tard. La fonctionnalité est prête à être connectée.");
  });
}

// === UTILS ===
function formatCurrency(amount) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

function escapeHTML(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type = "info") {
  const container = document.querySelector("#toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add("fade-out"); setTimeout(() => toast.remove(), 500); }, 3000);
}

// Lancement
init();
