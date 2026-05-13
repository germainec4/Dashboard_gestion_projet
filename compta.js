// Configuration Supabase (sera injectée via .env ou définie ici)
const SUPABASE_URL = window.location.hostname === 'localhost' ? 'https://vjlhyvfnyfdcwqxhvdrg.supabase.co' : 'https://vjlhyvfnyfdcwqxhvdrg.supabase.co';
const SUPABASE_ANON_KEY = 'votre_anon_key'; // Idéalement à charger dynamiquement

let supabase;
if (window.supabase) {
    // Si déjà chargé par app.js (si on partage le même contexte)
    // Mais ici on est sur une page séparée
}

// Initialisation (à adapter selon ta config réelle)
document.addEventListener('DOMContentLoaded', async () => {
    // Récupération des clés depuis localStorage si possible, sinon utiliser les globales
    const savedUrl = localStorage.getItem('supabaseUrl');
    const savedKey = localStorage.getItem('supabaseKey');
    
    if (savedUrl && savedKey) {
        supabase = window.supabase.createClient(savedUrl, savedKey);
    } else {
        // Fallback pour le dev local
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    await loadData();
    initEventListeners();
});

let missions = [];
let selectedQuarters = [];
let objectives = {
    q1: localStorage.getItem('obj_q1') || 10000,
    q2: localStorage.getItem('obj_q2') || 10000,
    q3: localStorage.getItem('obj_q3') || 10000,
    q4: localStorage.getItem('obj_q4') || 10000
};

async function loadData() {
    try {
        const { data, error } = await supabase
            .from('missions')
            .select('*')
            .order('date', { ascending: false });

        if (error) throw error;
        missions = data;

        // Par défaut, sélectionner le trimestre actuel s'il n'y a pas de sélection
        if (selectedQuarters.length === 0) {
            const currentQuarter = Math.floor(new Date().getMonth() / 3) + 1;
            const currentYear = new Date().getFullYear();
            selectedQuarters = [`Q${currentQuarter}-${currentYear}`];
        }

        renderQuarterPills();
        renderKPIs();
        renderTable();
        animateCounters();
    } catch (err) {
        console.error("Erreur lors du chargement des missions:", err);
    }
}

function getQuartersList() {
    const quarters = new Set();
    missions.forEach(m => {
        const date = new Date(m.date);
        const q = Math.floor(date.getMonth() / 3) + 1;
        const y = date.getFullYear();
        quarters.add(`Q${q}-${y}`);
    });
    
    // Ajouter aussi les trimestres de l'année en cours s'ils n'y sont pas
    const currentYear = new Date().getFullYear();
    for(let i=1; i<=4; i++) {
        quarters.add(`Q${i}-${currentYear}`);
    }
    
    return Array.from(quarters).sort().reverse();
}

function renderQuarterPills() {
    const container = document.getElementById('quarterPills');
    const allQuarters = getQuartersList();
    
    container.innerHTML = allQuarters.map(q => `
        <div class="quarter-pill ${selectedQuarters.includes(q) ? 'selected' : ''}" data-quarter="${q}">
            <div class="checkbox"></div>
            ${q.replace('-', ' ')}
        </div>
    `).join('');

    // Add click listeners
    container.querySelectorAll('.quarter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const q = pill.dataset.quarter;
            if (selectedQuarters.includes(q)) {
                if (selectedQuarters.length > 1) {
                    selectedQuarters = selectedQuarters.filter(item => item !== q);
                }
            } else {
                selectedQuarters.push(q);
            }
            renderQuarterPills();
            renderKPIs();
            renderTable();
            animateCounters();
        });
    });
}

function renderKPIs() {
    const filteredMissions = missions.filter(m => {
        const date = new Date(m.date);
        const q = `Q${Math.floor(date.getMonth() / 3) + 1}-${date.getFullYear()}`;
        return selectedQuarters.includes(q);
    });

    const facturation = filteredMissions.reduce((acc, m) => acc + Number(m.price), 0);
    const encaissement = filteredMissions
        .filter(m => m.status === 'payee')
        .reduce((acc, m) => acc + Number(m.price), 0);
    const attente = facturation - encaissement;
    const attenteCount = filteredMissions.filter(m => m.status !== 'payee').length;

    // Calcul cumul annuel (Malt)
    const currentYear = new Date().getFullYear();
    const annuelFacture = missions
        .filter(m => new Date(m.date).getFullYear() === currentYear)
        .reduce((acc, m) => acc + Number(m.price), 0);

    // Update Targets
    const kpiFacture = document.getElementById('kpiFacture');
    const kpiEncaisse = document.getElementById('kpiEncaisse');
    const kpiAttente = document.getElementById('kpiAttente');
    const kpiAnnuel = document.getElementById('kpiAnnuel');

    kpiFacture.dataset.target = facturation;
    kpiEncaisse.dataset.target = encaissement;
    kpiAttente.dataset.target = attente;
    kpiAnnuel.dataset.target = annuelFacture;

    // Update trend vs objective (calculé sur le premier trimestre sélectionné pour l'exemple)
    const firstQ = selectedQuarters[0];
    const qKey = firstQ.split('-')[0].toLowerCase();
    const obj = objectives[qKey] || 10000;
    const progress = (facturation / obj) * 100;

    document.getElementById('kpiFactureTrend').textContent = `${Math.round(progress)}%`;
    document.getElementById('kpiFactureProgress').style.width = `${Math.min(progress, 100)}%`;
    document.getElementById('kpiEncaisseProgress').style.width = `${facturation > 0 ? (encaissement / facturation) * 100 : 0}%`;
    document.getElementById('kpiAttenteCount').textContent = `${attenteCount} missions à régler`;
    document.getElementById('kpiAnnuelProgress').style.width = `${Math.min((annuelFacture / 50000) * 100, 100)}%`;
}

function animateCounters() {
    const counters = document.querySelectorAll('.counter');
    counters.forEach(counter => {
        const target = parseFloat(counter.dataset.target);
        const duration = 1000; // 1s
        const start = 0;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function
            const easeOutQuad = t => t * (2 - t);
            const current = start + (target - start) * easeOutQuad(progress);
            
            counter.textContent = new Intl.NumberFormat('fr-FR', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0
            }).format(current);

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }
        requestAnimationFrame(update);
    });
}

function renderTable() {
    const container = document.getElementById('comptaContainer');
    container.innerHTML = '';

    // Group selected quarters
    selectedQuarters.sort().reverse().forEach(q => {
        const filtered = missions.filter(m => {
            const date = new Date(m.date);
            const mq = `Q${Math.floor(date.getMonth() / 3) + 1}-${date.getFullYear()}`;
            return mq === q;
        });

        if (filtered.length === 0) return;

        const facturation = filtered.reduce((acc, m) => acc + Number(m.price), 0);
        
        const section = document.createElement('div');
        section.className = 'quarter-section';
        section.innerHTML = `
            <div class="quarter-header">
                <span class="quarter-title">${q.replace('-', ' ')}</span>
                <div class="quarter-stats">
                    <span>Facturé: <strong>${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(facturation)}</strong></span>
                </div>
            </div>
            <table class="compta-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Mission</th>
                        <th>Client</th>
                        <th>Statut</th>
                        <th>Montant Net</th>
                        <th style="width: 80px"></th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map(m => `
                        <tr>
                            <td class="text-secondary">${new Date(m.date).toLocaleDateString()}</td>
                            <td class="mission-title">${m.title}</td>
                            <td>${m.client}</td>
                            <td>
                                <span class="status-badge ${m.status === 'payee' ? 'status-paid' : 'status-pending'}">
                                    ${m.status === 'payee' ? 'Payée' : 'En attente'}
                                </span>
                            </td>
                            <td class="price-col">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(m.price)}</td>
                            <td>
                                <div style="display: flex; gap: 0.5rem;">
                                    <button class="action-btn edit" onclick="editMission('${m.id}')">
                                        <svg class="icon-sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                    <button class="action-btn delete" onclick="deleteMission('${m.id}')">
                                        <svg class="icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        container.appendChild(section);
    });
}

// Modal & Forms
const modal = document.getElementById('missionModal');
const objModal = document.getElementById('objectivesModal');

function initEventListeners() {
    document.getElementById('addMissionBtn').addEventListener('click', () => {
        document.getElementById('missionForm').reset();
        document.getElementById('missionId').value = '';
        document.getElementById('modalTitle').textContent = 'Nouvelle Mission';
        modal.classList.add('show');
    });

    document.getElementById('closeModal').addEventListener('click', () => modal.classList.remove('show'));
    document.getElementById('closeObjectivesModal').addEventListener('click', () => objModal.classList.remove('show'));

    document.getElementById('openObjectivesBtn').addEventListener('click', () => {
        document.getElementById('obj_q1').value = objectives.q1;
        document.getElementById('obj_q2').value = objectives.q2;
        document.getElementById('obj_q3').value = objectives.q3;
        document.getElementById('obj_q4').value = objectives.q4;
        objModal.classList.add('show');
    });

    document.getElementById('missionForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('missionId').value;
        const missionData = {
            title: document.getElementById('m_title').value,
            client: document.getElementById('m_client').value,
            price: document.getElementById('m_price').value,
            date: document.getElementById('m_date').value,
            status: document.getElementById('m_status').value
        };

        try {
            if (id) {
                await supabase.from('missions').update(missionData).eq('id', id);
            } else {
                await supabase.from('missions').insert([missionData]);
            }
            modal.classList.remove('show');
            await loadData();
        } catch (err) {
            console.error("Erreur sauvegarde mission:", err);
        }
    });

    document.getElementById('objectivesForm').addEventListener('submit', (e) => {
        e.preventDefault();
        objectives.q1 = document.getElementById('obj_q1').value;
        objectives.q2 = document.getElementById('obj_q2').value;
        objectives.q3 = document.getElementById('obj_q3').value;
        objectives.q4 = document.getElementById('obj_q4').value;
        
        localStorage.setItem('obj_q1', objectives.q1);
        localStorage.setItem('obj_q2', objectives.q2);
        localStorage.setItem('obj_q3', objectives.q3);
        localStorage.setItem('obj_q4', objectives.q4);
        
        objModal.classList.remove('show');
        renderKPIs();
        animateCounters();
    });

  const syncBtn = document.getElementById('syncQontoBtn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg> Synchronisation...';
      
      try {
        const { data, error } = await supabase.functions.invoke('sync-qonto');
        
        if (error) throw error;
        
        if (data.results.matched > 0) {
          showToast(`${data.results.matched} mission(s) marquée(s) comme payée(s) !`, "success");
          await loadData();
        } else {
          showToast("Aucun nouveau paiement détecté.", "info");
        }
      } catch (err) {
        console.error("Erreur sync Qonto:", err);
        showToast("Erreur lors de la synchronisation Qonto", "error");
      } finally {
        syncBtn.disabled = false;
        syncBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" style="stroke: white;"><path d="M20 11a8.1 8.1 0 0 0-15.5-2m-.5 5v-5h5M4 13a8.1 8.1 0 0 0 15.5 2m.5-5v5h-5"/></svg> Synchroniser Qonto';
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (multiDropdown && !multiDropdown.contains(e.target) && !multiBtn.contains(e.target)) {
      multiDropdown.classList.remove('show');
    }
  });
}

window.editMission = function(id) {
    const m = missions.find(mission => mission.id === id);
    if (!m) return;

    document.getElementById('missionId').value = m.id;
    document.getElementById('m_title').value = m.title;
    document.getElementById('m_client').value = m.client;
    document.getElementById('m_price').value = m.price;
    document.getElementById('m_date').value = m.date;
    document.getElementById('m_status').value = m.status;
    document.getElementById('modalTitle').textContent = 'Modifier Mission';
    modal.classList.add('show');
};

window.deleteMission = async function(id) {
    if (confirm('Supprimer cette mission ?')) {
        try {
            await supabase.from('missions').delete().eq('id', id);
            await loadData();
        } catch (err) {
            console.error("Erreur suppression:", err);
        }
    }
};

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--primary)'};
        color: white;
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        z-index: 2000;
        animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
