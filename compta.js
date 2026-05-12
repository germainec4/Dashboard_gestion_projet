import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;
let missions = [];

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
  missions = data;
  renderAll();
}

// === RENDU UI ===
function renderAll() {
  renderKPIs();
  renderTable();
  renderCharts();
}

function renderKPIs() {
  let caTotal = 0;
  let caQuarterPaye = 0;
  let resteARecevoir = 0;

  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const currentYear = now.getFullYear();

  missions.forEach(m => {
    const price = parseFloat(m.price) || 0;
    caTotal += price;

    if (m.status !== 'payee') {
      resteARecevoir += price;
    } else if (m.status === 'payee' && m.date_payment) {
      const pDate = new Date(m.date_payment);
      if (pDate.getFullYear() === currentYear && Math.floor(pDate.getMonth() / 3) === currentQuarter) {
        caQuarterPaye += price;
      }
    }
  });

  const urssafEstime = caQuarterPaye * URSSAF_RATE;
  
  const revenuImposable = caTotal * IMPOT_ABATTEMENT;
  const impotsEstimes = revenuImposable > IMPOT_SEUIL ? (revenuImposable - IMPOT_SEUIL) * IMPOT_TAUX : 0;

  document.getElementById('kpi-ca').textContent = formatCurrency(caTotal);
  document.getElementById('kpi-urssaf').textContent = formatCurrency(urssafEstime);
  document.getElementById('kpi-impots').textContent = formatCurrency(impotsEstimes);
  document.getElementById('kpi-reste').textContent = formatCurrency(resteARecevoir);
}

function renderTable() {
  const tbody = document.getElementById('missionsTableBody');
  tbody.innerHTML = '';

  missions.forEach(m => {
    // Alert logic: If terminee and more than 30 days since validation, but not paid -> red text for price
    let isLate = false;
    if (m.status === 'terminee' && m.date_validation) {
        const valDate = new Date(m.date_validation);
        const diffDays = (new Date() - valDate) / (1000 * 60 * 60 * 24);
        if (diffDays > 30) isLate = true;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHTML(m.title)}</strong></td>
      <td>${escapeHTML(m.client || '')}</td>
      <td>${escapeHTML(m.entity || '')}</td>
      <td>${m.quote_accepted ? '✅' : (m.quote_sent ? 'Envoyé' : '❌')}</td>
      <td class="${isLate ? 'late-payment' : ''}">${formatCurrency(m.price)} ${isLate ? '🚨' : ''}</td>
      <td style="color:var(--text-muted)">${m.debours > 0 ? formatCurrency(m.debours) : '-'}</td>
      <td>${m.date_validation ? new Date(m.date_validation).toLocaleDateString('fr-FR') : '-'}</td>
      <td>${m.date_payment ? new Date(m.date_payment).toLocaleDateString('fr-FR') : '-'}</td>
      <td><span class="status-badge status-${m.status}">${STATUS_LABELS[m.status]}</span></td>
      <td>
        <button class="icon-button edit-btn" data-id="${m.id}" title="Éditer">✏️</button>
        <button class="icon-button delete-btn" data-id="${m.id}" title="Supprimer">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// === CHARTS ===
let chartCA = null;
let chartPerf = null;

function renderCharts() {
  const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  const caByMonth = new Array(12).fill(0);
  const currentYear = new Date().getFullYear();

  missions.forEach(m => {
    if (m.date_validation) {
      const d = new Date(m.date_validation);
      if (d.getFullYear() === currentYear) {
        caByMonth[d.getMonth()] += parseFloat(m.price) || 0;
      }
    }
  });

  const ctxCA = document.getElementById('caEvolutionChart').getContext('2d');
  if (chartCA) chartCA.destroy();
  chartCA = new Chart(ctxCA, {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'CA Réalisé',
        data: caByMonth,
        borderColor: '#3182ce',
        backgroundColor: 'rgba(49, 130, 206, 0.1)',
        fill: true,
        tension: 0.3
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  const quarters = [0, 0, 0, 0];
  missions.forEach(m => {
    if (m.date_validation) {
      const d = new Date(m.date_validation);
      if (d.getFullYear() === currentYear) {
        quarters[Math.floor(d.getMonth() / 3)] += parseFloat(m.price) || 0;
      }
    }
  });

  const ctxPerf = document.getElementById('perfGoalChart').getContext('2d');
  if (chartPerf) chartPerf.destroy();
  chartPerf = new Chart(ctxPerf, {
    type: 'bar',
    data: {
      labels: ["Q1", "Q2", "Q3", "Q4"],
      datasets: [{
        label: 'CA Réalisé',
        data: quarters,
        backgroundColor: '#48bb78',
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}


// === ACTIONS & EVENTS ===
function initEventListeners() {
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
    const editBtn = e.target.closest('.edit-btn');
    if (editBtn) {
      const m = missions.find(x => x.id === editBtn.dataset.id);
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
