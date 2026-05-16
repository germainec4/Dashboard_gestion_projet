import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

let supabase = null;
let userSession = null;
let googleTokenClient = null;
let googleAccessToken = localStorage.getItem('google_access_token') || null;
let googleTokenExpiry = parseInt(localStorage.getItem('google_token_expiry') || "0");
let calendar = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase Client Initialisé");
  } catch (e) {
    console.error("Erreur lors de l'initialisation de Supabase:", e);
  }
} else {
  console.warn("Variables Supabase manquantes dans l'environnement");
}

// --- AUTH LOGIC ---
async function initAuth() {
  if (!supabase) return;

  const { data: { session } } = await supabase.auth.getSession();
  handleAuthStateChange(session);

  supabase.auth.onAuthStateChange((_event, session) => {
    handleAuthStateChange(session);
  });
}

function handleAuthStateChange(session) {
  userSession = session;
  const overlay = document.querySelector("#authOverlay");

  if (session) {
    overlay.classList.add("hidden");
    console.log("Utilisateur connecté:", session.user.email);
    refreshData();
  } else {
    overlay.classList.remove("hidden");
    state = structuredClone(seedState);
    render();
  }
}

async function refreshData() {
  state = await loadState();
  render();
}


const STORAGE_KEY = "multi-focus-engine:v1";

const pillars = [
  { id: "engineer", label: "IET", color: "#3291ff" },
  { id: "design", label: "Web Design", color: "#f5a623" },
  { id: "commerce", label: "E-commerce", color: "#0cce6b" },
  { id: "untriaged", label: "Non trié", color: "#8f8f8f" },
];

const statuses = [
  { id: "inbox", label: "Inbox" },
  { id: "planned", label: "Planifié" },
  { id: "focus", label: "Priorité jour" },
  { id: "blocked", label: "Bloqué" },
  { id: "done", label: "Terminé" },
];

const workPlanGroups = [
  { id: "inbox", title: "À trier", hint: "Idées brutes et prochaines actions non décidées." },
  { id: "planned", title: "Planifié", hint: "Sélection de la semaine, pas encore prioritaire." },
  { id: "blocked", title: "Bloqué", hint: "En attente d'un retour, d'une décision ou d'une ressource." },
  { id: "done", title: "Terminé", hint: "Ce qui est sorti du système actif." },
];

const ICONS = {
  plus: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14m-7-7h14"/></svg>',
  focus: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  plan: '<svg class="icon" viewBox="0 0 24 24"><path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>',
  trash: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  edit: '<svg class="icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  reopen: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8m0-5v5h5"/></svg>',
  arrowRight: '<svg class="icon" viewBox="0 0 24 24"><path d="M5 12h14m-7-7l7 7-7 7"/></svg>',
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

// Fonction utilitaire pour nettoyer les descriptions techniques (Decathlon Sync, etc.)
function cleanDescription(text) {
  if (!text) return "";
  return text
    .replace(/\[\[SYNC_DECATHLON_.*?\]\]/gi, "")
    .replace(/Source\s*:\s*.*?(?=(?:\s*Type détecté|$|\s*Task status))/gi, "")
    .replace(/Source event ID\s*:\s*.*?(?=\s|$)/gi, "")
    .replace(/Synchronisé automatiquement depuis le compte Decathlon\./gi, "")
    .replace(/Type détecté\s*:\s*.*?(?=\s|$)/gi, "")
    .replace(/Task ID\s*:\s*.*?(?=\s|$)/gi, "")
    .replace(/Task status\s*:\s*.*?(?=\s|$)/gi, "")
    .replace(/Task list\s*:\s*.*?(?=\s|$)/gi, "")
    .replace(/\s\s+/g, ' ') // Supprimer les espaces doubles créés par le nettoyage
    .trim();
}

const seedState = {
  deepWorkPillar: "all",
  filters: { pillar: "all", status: "all" },
  projects: [],
  tasks: [],
  showArchives: false,
};

let state = structuredClone(seedState);
let selectedProjectId = null;
let currentView = "cockpit";

async function loadState() {
  console.log("Démarrage du chargement de l'état...");
  const localData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

  if (!supabase) {
    console.warn("Supabase non configuré. Utilisation du mode local.");
    return { ...seedState, ...localData };
  }

  try {
    const fetchWithTimeout = (promise) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout Supabase")), 5000))
    ]);

    const [pRes, tRes] = await Promise.all([
      fetchWithTimeout(supabase.from('projects').select('*')),
      fetchWithTimeout(supabase.from('tasks').select('*'))
    ]);

    if (pRes.error || tRes.error) {
      console.error("Erreur de récupération Supabase:", pRes.error || tRes.error);
      return { ...seedState, ...localData };
    }

    console.log("Données Cloud chargées avec succès");

    const mappedProjects = pRes.data.map(p => ({
      id: p.id,
      name: p.name,
      pillar: p.pillar,
      doneDefinition: p.done_definition,
      status: p.status,
      createdAt: p.created_at,
      startDate: p.start_date,
      dueDate: p.due_date
    }));

    const mappedTasks = tRes.data.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      pillar: t.pillar,
      projectId: t.project_id,
      status: t.status,
      createdAt: t.created_at,
      dueDate: t.due_date
    }));

    return {
      ...seedState,
      ...localData,
      projects: mappedProjects,
      tasks: mappedTasks,
    };
  } catch (e) {
    console.error("Échec du chargement cloud:", e);
    return { ...seedState, ...localData };
  }
}

async function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    deepWorkPillar: state.deepWorkPillar,
    filters: state.filters,
    showArchives: state.showArchives
  }));
}

// Opérations de données
async function addTask(title, pillar, projectId = "") {
  const newTask = {
    id: uid("task"),
    title,
    description: document.querySelector("#quickDescription")?.value.trim() || "",
    pillar,
    projectId,
    status: document.querySelector("#quickStatus")?.value || "inbox",
    createdAt: todayISO(),
    dueDate: document.querySelector("#quickDueDate")?.value || null
  };

  state.tasks.unshift(newTask);
  persistAndRender();

  if (supabase) {
    console.log("Tentative d'insertion cloud...");
    const { error } = await supabase.from('tasks').insert([{
      id: newTask.id,
      title: newTask.title,
      description: newTask.description,
      pillar: newTask.pillar,
      project_id: newTask.projectId || null,
      status: newTask.status,
      created_at: newTask.createdAt,
      due_date: newTask.dueDate
    }]);
    if (error) {
      console.error("Erreur d'insertion Supabase:", error);
      showToast("Erreur de synchronisation Cloud", "error");
    } else {
      console.log("Tâche synchronisée avec succès");
    }
  }
  return newTask;
}

async function updateTask(id, updates) {
  const index = state.tasks.findIndex(t => t.id === id);
  if (index === -1) return;

  state.tasks[index] = { ...state.tasks[index], ...updates };
  persistAndRender();

  if (supabase) {
    const dbUpdates = {
      title: updates.title,
      description: updates.description,
      pillar: updates.pillar,
      project_id: updates.projectId === undefined ? undefined : (updates.projectId || null),
      status: updates.status,
      due_date: updates.dueDate
    };
    Object.keys(dbUpdates).forEach(key => dbUpdates[key] === undefined && delete dbUpdates[key]);
    const { error } = await supabase.from('tasks').update(dbUpdates).eq('id', id);
    if (error) console.error("Erreur de mise à jour Supabase:", error);
  }
  return state.tasks[index];
}

async function deleteTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  if (!confirm(`Supprimer "${task.title}" ?`)) return;

  state.tasks = state.tasks.filter(t => t.id !== id);
  persistAndRender();

  if (supabase) {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) console.error("Erreur de suppression Supabase:", error);
  }
}

async function setTaskStatus(id, status) {
  if (status === "focus") {
    const focusCount = state.tasks.filter(t => t.status === "focus").length;
    if (focusCount >= 5) {
      showToast("Limite de 5 priorités atteinte !", "warning");
      return;
    }
  }
  await updateTask(id, { status });
}

// Projets
async function saveProject(data) {
  const { id, name, pillar, doneDefinition, startDate, dueDate } = data;
  const dbProject = {
    id: id || uid("project"),
    name,
    pillar,
    done_definition: doneDefinition,
    start_date: startDate,
    due_date: dueDate,
    status: "active",
    created_at: todayISO()
  };

  if (id) {
    state.projects = state.projects.map(p => p.id === id ? { ...p, ...data } : p);
    if (supabase) {
      const { error } = await supabase.from('projects').update(dbProject).eq('id', id);
      if (error) console.error("Erreur de mise à jour projet Supabase:", error);
    }
  } else {
    state.projects.push({ ...dbProject, doneDefinition, startDate, dueDate, createdAt: dbProject.created_at });
    if (supabase) {
      const { error } = await supabase.from('projects').insert([dbProject]);
      if (error) console.error("Erreur d'insertion projet Supabase:", error);
    }
  }
  persistAndRender();
}

async function deleteProject(id) {
  const project = projectById(id);
  if (!project) return;
  if (!confirm(`Supprimer le projet "${project.name}" et toutes ses tâches ?`)) return;

  state.projects = state.projects.filter(p => p.id !== id);
  state.tasks = state.tasks.filter(t => t.projectId !== id);
  persistAndRender();

  if (supabase) {
    const { error: tErr } = await supabase.from('tasks').delete().eq('project_id', id);
    const { error: pErr } = await supabase.from('projects').delete().eq('id', id);
    if (tErr || pErr) console.error("Erreur de suppression projet Supabase:", tErr || pErr);
  }
}

// Helpers
function pillarById(id) {
  return pillars.find((pillar) => pillar.id === id) || pillars[pillars.length - 1];
}
function projectById(id) { return state.projects.find((p) => p.id === id); }
function isInDeepWorkContext(item) {
  return state.deepWorkPillar === "all" || item.pillar === state.deepWorkPillar;
}
function projectProgress(projectId) {
  const projectTasks = state.tasks.filter((t) => t.projectId === projectId);
  if (projectTasks.length === 0) return 0;
  const doneTasks = projectTasks.filter((t) => t.status === "done");
  return Math.round((doneTasks.length / projectTasks.length) * 100);
}

// Rendu Global
function render() {
  try {
    renderContextAccent();
    renderSelectOptions();
    renderMetrics();

    if (currentView === "cockpit") {
      renderTaskSections();
    } else if (currentView === "map") {
      renderProjects();

    } else if (currentView === "calendar") {
      renderCalendarView();
    }

    initDragAndDrop();

    // Mise à jour dynamique du détail du projet si ouvert
    const projectDetailDialog = document.querySelector("#projectDetailDialog");
    if (projectDetailDialog && projectDetailDialog.open && selectedProjectId) {
      renderProjectTasks(selectedProjectId);
      const progress = projectProgress(selectedProjectId);
      document.querySelector("#detailProgressBar").style.width = `${progress}%`;
      document.querySelector("#detailProgressPercent").textContent = `${progress}%`;
    }
  } catch (e) {
    console.error("Erreur de rendu:", e);
  }
}

function renderContextAccent() {
  const contextPillar = state.deepWorkPillar === "all" ? null : pillarById(state.deepWorkPillar);
  document.body.dataset.context = contextPillar?.id || "all";
  document.body.style.setProperty("--context-accent", contextPillar?.color || "#ededed");
  document.body.style.setProperty("--context-accent-soft", contextPillar ? `${contextPillar.color}24` : "rgba(255, 255, 255, 0.08)");
}

function renderSelectOptions() {
  const pillarOptions = pillars.map(p => `<option value="${p.id}">${p.label}</option>`).join("");
  const statusOptions = statuses.map(s => `<option value="${s.id}">${s.label}</option>`).join("");

  const safeSetHTML = (id, html) => { const el = document.querySelector(id); if (el) el.innerHTML = html; };
  safeSetHTML("#quickPillar", pillarOptions);
  safeSetHTML("#projectPillarInput", pillarOptions);
  safeSetHTML("#contextSwitch", `<option value="all">Tous les piliers</option>${pillarOptions}`);
  safeSetHTML("#pillarFilter", `<option value="all">Tous</option>${pillarOptions}`);
  safeSetHTML("#quickStatus", statusOptions);

  updateQuickProjectOptions();

  const safeSetVal = (id, val) => { const el = document.querySelector(id); if (el) el.value = val; };
  safeSetVal("#contextSwitch", state.deepWorkPillar);
  safeSetVal("#pillarFilter", state.filters.pillar);
  safeSetVal("#statusFilter", state.filters.status);
  const sat = document.querySelector("#showArchivesToggle"); if (sat) sat.checked = !!state.showArchives;
}

function updateQuickProjectOptions(selectedProjectId = "") {
  const pillarId = document.querySelector("#quickPillar")?.value;
  const projectSelect = document.querySelector("#quickProject");
  if (!projectSelect) return;

  const filteredProjects = state.projects.filter(p => !pillarId || p.pillar === pillarId);
  const projectOptions = filteredProjects.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join("");
  
  projectSelect.innerHTML = `<option value="">Sans projet</option>${projectOptions}`;
  if (selectedProjectId) {
    projectSelect.value = selectedProjectId;
  }
}

function renderMetrics() {
  const focusTasks = state.tasks.filter(t => t.status === "focus" && isInDeepWorkContext(t));
  const el = document.querySelector("#focusCount");
  if (el) {
    el.textContent = `${focusTasks.length}/5`;
    el.classList.toggle("warning", focusTasks.length >= 5);
  }
  const fw = document.querySelector("#focusWarning");
  if (fw) fw.classList.toggle("hidden", focusTasks.length <= 5);
}

// Rendu des Tâches (Premium)
function renderTaskSections() {
  const contextTasks = state.tasks.filter(isInDeepWorkContext);
  renderList("#focusList", contextTasks.filter(t => t.status === "focus"), "Aucune priorité jour.");
  renderList("#inboxList", contextTasks.filter(t => t.status === "inbox"), "Inbox vide.");

  const operationalTasks = contextTasks.filter(t => {
    const pMatch = state.filters.pillar === "all" || t.pillar === state.filters.pillar;
    const sMatch = state.filters.status === "all" || t.status === state.filters.status;
    return pMatch && sMatch;
  });
  renderWorkPlan(operationalTasks);
}

function renderList(selector, tasks, emptyText) {
  const container = document.querySelector(selector);
  if (!container) return;
  container.innerHTML = tasks.length ? tasks.map(taskCard).join("") : `<div class="empty-state">${emptyText}</div>`;
}

function renderWorkPlan(tasks) {
  const container = document.querySelector("#workPlan");
  if (!container) return;

  const body = [
    workPlanLane({ id: "focus", title: "Priorités du jour", hint: "Max 5. Décision immédiate.", tasks: tasks.filter(t => t.status === "focus"), featured: true }),
    ...workPlanGroups.map(group => workPlanLane({ ...group, tasks: tasks.filter(t => t.status === group.id) }))
  ].join("");

  container.innerHTML = body;
  container.classList.toggle("focus-mode", !state.showArchives);
}

function workPlanLane(group) {
  const isVisible = state.showArchives || !["blocked", "done"].includes(group.id);
  if (!isVisible) return "";

  return `
    <section class="work-lane ${group.featured ? 'work-lane-featured' : ''}" data-lane-id="${group.id}">
      <div class="work-lane-header">
        <div><h3>${group.title}</h3><p>${group.hint}</p></div>
        <span>${group.tasks.length}</span>
      </div>
      <div class="work-lane-body">
        ${group.tasks.length ? group.tasks.map(taskCard).join("") : '<div class="empty-state">Rien ici.</div>'}
      </div>
    </section>
  `;
}

function taskCard(task) {
  const pillar = pillarById(task.pillar);
  const project = projectById(task.projectId);
  const isDone = task.status === "done";

  return `
    <article class="task-card ${isDone ? 'done' : ''}" data-task-id="${task.id}" data-action="edit-task" data-id="${task.id}" tabindex="0" draggable="true">
      <div class="task-main">
        <div class="task-content-wrapper">
          <p class="task-title">${escapeHTML(task.title)}</p>
          ${task.description ? `<p class="task-description">${escapeHTML(cleanDescription(task.description))}</p>` : ''}
          <div class="meta-row">
            <span class="pill" style="--pillar-color: ${pillar.color}">
              <span class="pillar-dot"></span>${pillar.label}
            </span>
            <span>${project ? escapeHTML(project.name) : 'Sans projet'}</span>
            ${task.dueDate ? `<span>${task.dueDate}</span>` : ''}
          </div>
        </div>
        <div class="task-actions">${taskActions(task)}</div>
      </div>
    </article>
  `;
}

function taskActions(task) {
  const actions = [];
  const focusDisabled = state.tasks.filter(t => t.status === "focus").length >= 5 && task.status !== "focus";

  if (task.status !== "focus" && task.status !== "done") {
    actions.push(`<button class="action-button" data-action="focus" data-id="${task.id}" ${focusDisabled ? 'disabled' : ''}>${ICONS.focus}<span>Prioriser</span></button>`);
  }
  if (task.status !== "planned" && task.status !== "done") {
    actions.push(`<button class="action-button" data-action="planned" data-id="${task.id}">${ICONS.plan}<span>Planifier</span></button>`);
  }
  if (task.status !== "done") {
    actions.push(`<button class="action-button action-done" data-action="done" data-id="${task.id}">${ICONS.check}</button>`);
  } else {
    actions.push(`<button class="action-button" data-action="planned" data-id="${task.id}">${ICONS.reopen}<span>Réouvrir</span></button>`);
  }
  actions.push(`<button class="action-button" data-action="edit-task" data-id="${task.id}">${ICONS.edit}</button>`);
  actions.push(`<button class="action-button action-danger" data-action="delete" data-id="${task.id}">${ICONS.trash}</button>`);

  return actions.join("");
}

// Projets & Gantt
function renderProjects() {
  const container = document.querySelector("#projectList");
  if (!container) return;
  const contextProjects = state.projects.filter(isInDeepWorkContext);
  container.innerHTML = contextProjects.length ? contextProjects.map(projectCard).join("") : `<div class="empty-state">Aucun projet.</div>`;
  renderGantt();
}

function projectCard(project) {
  const pillar = pillarById(project.pillar);
  const projectTasks = state.tasks.filter(t => t.projectId === project.id);
  const doneTasks = projectTasks.filter(t => t.status === "done").length;
  const totalTasks = projectTasks.length;
  const nextAction = state.tasks.find(t => t.projectId === project.id && t.status !== "done");

  // Compute "Objectif : J-X" based on dueDate
  let deadlineBadge = '';
  if (project.dueDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Parse date safely to avoid timezone shifts
    const [year, month, day] = project.dueDate.split('-').map(Number);
    const due = new Date(year, month - 1, day);
    due.setHours(0, 0, 0, 0);
    
    const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));

    let badgeClass = 'normal';
    let label = '';
    if (diffDays < 0) {
      badgeClass = 'overdue';
      label = `Objectif : J+${Math.abs(diffDays)}`;
    } else if (diffDays === 0) {
      badgeClass = 'urgent';
      label = `Objectif : Jour J`;
    } else if (diffDays <= 3) {
      badgeClass = 'urgent';
      label = `Objectif : J-${diffDays}`;
    } else if (diffDays <= 10) {
      badgeClass = 'warning';
      label = `Objectif : J-${diffDays}`;
    } else {
      badgeClass = 'normal';
      label = `Objectif : J-${diffDays}`;
    }
    deadlineBadge = `<span class="deadline-badge ${badgeClass}">${label}</span>`;
  }

  return `
    <article class="project-card" data-action="open-project" data-id="${project.id}">
      <div class="project-top">
        <div><h3>${escapeHTML(project.name)}</h3>
          <div class="meta-row">
            <span class="pill" style="--pillar-color: ${pillar.color}"><span class="pillar-dot"></span>${pillar.label}</span>
            <span>${doneTasks} / ${totalTasks} tâches complétées</span>
          </div>
        </div>
        ${deadlineBadge}
      </div>
      <p class="muted" style="font-size: 13px; margin: 8px 0;">${escapeHTML(project.doneDefinition || '')}</p>
      <div class="meta-row">
        <span class="muted">Suivant :</span>
        <strong>${nextAction ? escapeHTML(nextAction.title) : 'À définir'}</strong>
      </div>
    </article>
  `;
}

function renderGantt() {
  const container = document.querySelector("#ganttTimeline");
  if (!container) return;
  const projects = state.projects.filter(p => p.status === "active" && isInDeepWorkContext(p));
  if (!projects.length) { container.innerHTML = ""; return; }

  const now = new Date();
  let startRange = new Date(now.getTime() - 7 * 86400000);
  let endRange = new Date(now.getTime() + 30 * 86400000);

  const totalDays = Math.ceil((endRange - startRange) / 86400000);
  container.style.minWidth = `${totalDays * 40}px`;

  // En-tête des mois
  let headerHTML = '<div class="gantt-header-row"><div class="gantt-project-name"></div><div class="gantt-track" style="position: relative; height: 30px;">';
  let currentMonth = -1;
  for (let d = 0; d < totalDays; d++) {
    const date = new Date(startRange.getTime() + d * 86400000);
    if (date.getMonth() !== currentMonth) {
      currentMonth = date.getMonth();
      const monthName = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      const left = (d / totalDays) * 100;
      headerHTML += `<span class="gantt-month-label" style="left: ${left}%">${monthName}</span>`;
    }
  }
  headerHTML += '</div></div>';

  const rowsHTML = projects.map(p => {
    const pillar = pillarById(p.pillar);
    const pStart = new Date(p.startDate || p.createdAt);
    const pEnd = p.dueDate ? new Date(p.dueDate) : new Date(pStart.getTime() + 14 * 86400000);
    const left = Math.max(0, ((pStart - startRange) / (endRange - startRange)) * 100);
    const width = Math.max(5, ((pEnd - pStart) / (endRange - startRange)) * 100);

    return `
      <div class="gantt-row">
        <div class="gantt-project-name">${escapeHTML(p.name)}</div>
        <div class="gantt-track">
          <div class="gantt-bar" style="left: ${left}%; width: ${width}%; background: ${pillar.color}"></div>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = headerHTML + rowsHTML;
}



// --- CALENDAR LOGIC ---
function renderCalendarView() {
  if (!calendar) {
    initCalendar();
  }
  renderCalendarSidebar();
  initSidebarToggle();
  
  // Si on a déjà un token, on peut tenter de rafraîchir les events
  if (googleAccessToken) {
    fetchGoogleEvents();
  }
}

function initSidebarToggle() {
  const layout = document.querySelector('.calendar-layout');
  const toggleBtn = document.getElementById('sidebarToggleBtn');
  const reopenBtn = document.getElementById('sidebarReopenBtn');
  if (!layout || !toggleBtn || !reopenBtn) return;

  // Restore state from localStorage
  const savedState = localStorage.getItem('calendar_sidebar_collapsed');
  if (savedState === 'true') {
    layout.classList.add('sidebar-collapsed');
  }

  toggleBtn.addEventListener('click', () => {
    layout.classList.add('sidebar-collapsed');
    localStorage.setItem('calendar_sidebar_collapsed', 'true');
    setTimeout(() => calendar?.updateSize(), 350);
  });

  reopenBtn.addEventListener('click', () => {
    layout.classList.remove('sidebar-collapsed');
    localStorage.setItem('calendar_sidebar_collapsed', 'false');
    setTimeout(() => calendar?.updateSize(), 350);
  });
}

function initCalendar() {
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;
  
  console.log("Initialisation de FullCalendar...");

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'timeGridWeek',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    firstDay: 1, // Lundi
    locale: 'fr',
    slotMinTime: '00:00:00',
    slotMaxTime: '24:00:00',
    slotDuration: '00:15:00',
    snapDuration: '00:15:00',
    scrollTime: '08:00:00',
    editable: true,
    droppable: true,
    eventContent: (arg) => {
      const props = arg.event.extendedProps;
      const isTask = props.isGoogleTask || false;
      const isCompleted = props.isTaskCompleted || false;
      const cleanTitle = props.cleanTitle || arg.event.title;
      const timeText = arg.timeText || '';

      const container = document.createElement('div');
      container.className = `fc-task-content ${isTask ? 'is-google-task' : ''} ${isCompleted ? 'fc-task-done' : ''}`;
      
      let checkboxHTML = '';
      if (isTask) {
        checkboxHTML = `
          <span class="fc-task-checkbox ${isCompleted ? 'checked' : ''}" data-event-id="${arg.event.id}">
            ${isCompleted ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>' : ''}
          </span>
        `;
      }

      container.innerHTML = `
        ${checkboxHTML}
        <div class="fc-task-text">
          <span class="fc-task-title">${escapeHTML(cleanTitle)}</span>
          <span class="fc-task-time">${timeText}</span>
        </div>
      `;

      if (isTask) {
        const checkbox = container.querySelector('.fc-task-checkbox');
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleTaskCompletion(arg.event);
        });
      }

      return { domNodes: [container] };
    },
    eventClick: (info) => {
      // Ne pas ouvrir le détail si on a cliqué sur la checkbox
      if (info.jsEvent.target.closest('.fc-task-checkbox')) return;
      showEventDetails(info.event);
    },
    eventReceive: async (info) => {
      // Appelé quand une tâche externe est lâchée sur le calendrier
      const taskId = info.draggedEl.dataset.id;
      const task = state.tasks.find(t => t.id === taskId);
      
      // Appliquer immédiatement les classes visuelles (pilier + source)
      if (task) {
        const pillarClass = `fc-event-pillar-${task.pillar || 'untriaged'}`;
        info.event.setProp('classNames', ['fc-event-source-primary', pillarClass]);
      }
      
      if (task && googleAccessToken) {
        const success = await createGoogleEvent(task, info.event.start, info.event.end || new Date(info.event.start.getTime() + 3600000));
        if (success) {
          showToast(`Temps bloqué pour : ${task.title}`, "success");
        } else {
          info.revert();
          showToast("Erreur lors de la création sur Google Calendar", "error");
        }
      } else if (!googleAccessToken) {
        showToast("Veuillez vous connecter à Google d'abord", "warning");
        info.revert();
      }
    },
    eventDrop: async (info) => {
      const { event } = info;
      const gEvent = event.extendedProps.googleEvent;
      if (gEvent && googleAccessToken) {
        const task = {
          id: event.extendedProps.localTaskId,
          title: event.title,
          description: event.extendedProps.description || ""
        };
        await updateGoogleEvent(gEvent.calendarId || 'primary', gEvent.id, task, event.start, event.end || event.start);
      }
    },
    eventResize: async (info) => {
      const { event } = info;
      const gEvent = event.extendedProps.googleEvent;
      if (gEvent && googleAccessToken) {
        const task = {
          id: event.extendedProps.localTaskId,
          title: event.title,
          description: event.extendedProps.description || ""
        };
        await updateGoogleEvent(gEvent.calendarId || 'primary', gEvent.id, task, event.start, event.end || event.start);
      }
    },
    selectable: true,
    selectMirror: true,
    select: (info) => {
      openTaskDialogFromCalendar(info.start, info.end);
      calendar.unselect();
    },
    events: [], // Sera rempli par fetchGoogleEvents
    datesSet: (info) => {
      // Important : charger les événements Google pour la nouvelle période visible
      fetchGoogleEvents(info.start, info.end);
    }
  });

  calendar.render();
  
  // --- Navigation intelligente pendant le Drag (Style Google Calendar) ---
  let navTimeout = null;
  let currentNavDir = null;

  const stopNav = () => {
    clearTimeout(navTimeout);
    navTimeout = null;
    currentNavDir = null;
    calendarEl.querySelectorAll('.fc-button-dragover').forEach(b => b.classList.remove('fc-button-dragover'));
  };

  const startNav = (dir) => {
    if (currentNavDir === dir) return;
    stopNav();
    currentNavDir = dir;
    
    // Feedback visuel sur les boutons
    if (dir === 'prev') calendarEl.querySelector('.fc-prev-button')?.classList.add('fc-button-dragover');
    if (dir === 'next') calendarEl.querySelector('.fc-next-button')?.classList.add('fc-button-dragover');

    navTimeout = setTimeout(() => {
      if (dir === 'prev') calendar.prev();
      else if (dir === 'next') calendar.next();
      
      currentNavDir = null; // Permet de relancer après un petit délai si on reste dans la zone
    }, 600); // Plus réactif (600ms au lieu de 900ms)
  };

  const checkNavZone = (x, y, target) => {
    const rect = calendarEl.getBoundingClientRect();
    const edgeThreshold = 80; // Zone plus large pour faciliter la navigation au bord
    
    const prevBtn = calendarEl.querySelector('.fc-prev-button');
    const nextBtn = calendarEl.querySelector('.fc-next-button');
    
    // On vérifie si on est soit sur le bouton, soit sur le bord du container
    const isPrev = prevBtn?.contains(target) || (x >= rect.left && x <= rect.left + edgeThreshold && y >= rect.top && y <= rect.bottom);
    const isNext = nextBtn?.contains(target) || (x <= rect.right && x >= rect.right - edgeThreshold && y >= rect.top && y <= rect.bottom);

    if (isPrev) {
      startNav('prev');
    } else if (isNext) {
      startNav('next');
    } else {
      stopNav();
    }
  };


  // Pour les tâches externes (Drag natif)
  const onExternalDragOver = (e) => {
    if (currentView !== 'calendar') return;
    checkNavZone(e.clientX, e.clientY, e.target);
  };
  
  calendarEl.addEventListener('dragover', (e) => e.preventDefault()); 
  document.addEventListener('dragover', onExternalDragOver);
  document.addEventListener('dragend', stopNav);
  calendarEl.addEventListener('drop', stopNav);
  
  // Pour les événements internes (JS Drag de FullCalendar)
  calendar.setOption('eventDragStart', (info) => {
    window._isDraggingInternal = true;
    const onMove = (e) => {
      if (window._isDraggingInternal) checkNavZone(e.clientX, e.clientY, e.target);
    };
    window.addEventListener('mousemove', onMove);
    window._fcMoveHandler = onMove;
  });

  calendar.setOption('eventDragStop', (info) => {
    window._isDraggingInternal = false;
    if (window._fcMoveHandler) {
      window.removeEventListener('mousemove', window._fcMoveHandler);
    }
    stopNav();
  });
  
  // Initialiser le Drag & Drop des tâches externes
  new FullCalendar.Draggable(document.getElementById('externalTasksList'), {
    itemSelector: '.task-card',
    eventData: function(eventEl) {
      return {
        title: eventEl.querySelector('.task-title').innerText,
        duration: '01:00'
      };
    }
  });
}

async function initGoogleAuth() {
  console.log("Tentative d'initialisation Google Auth...");
  
  if (!GOOGLE_CLIENT_ID) {
    console.error("VITE_GOOGLE_CLIENT_ID est manquant dans l'environnement !");
    // Pas de toast ici pour ne pas polluer si on n'est pas sur l'onglet calendar
    return;
  }

  if (!window.google) {
    console.warn("Le SDK Google (window.google) n'est pas encore chargé.");
    return;
  }
  
  try {
    if (googleTokenClient) return; // Déjà fait
    
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
      callback: (response) => {
        if (response.error !== undefined) {
          console.error("Erreur Google Auth Callback:", response);
          showToast("Erreur d'authentification Google : " + response.error, "error");
          throw (response);
        }
        googleAccessToken = response.access_token;
        googleTokenExpiry = Date.now() + (response.expires_in * 1000);
        
        localStorage.setItem('google_access_token', googleAccessToken);
        localStorage.setItem('google_token_expiry', googleTokenExpiry.toString());
        
        console.log("Token Google reçu et sauvegardé.");
        updateGoogleLoginButton();
        fetchGoogleEvents();
      },
    });
    
    // Vérifier si un token valide est déjà présent
    if (googleAccessToken && Date.now() < googleTokenExpiry) {
      console.log("Token Google valide trouvé en cache.");
      updateGoogleLoginButton();
      fetchGoogleEvents();
    }
    console.log("Client Google Token initialisé.");
  } catch (err) {
    console.error("Erreur lors de l'initialisation du client Google:", err);
  }
}

// Exposer pour index.html
window.initGoogleAuth = initGoogleAuth;

function handleGoogleAuth() {
  console.log("Bouton Google cliqué.");
  if (googleAccessToken && Date.now() < googleTokenExpiry) {
    console.log("Déjà connecté avec un token valide, rafraîchissement des événements...");
    fetchGoogleEvents();
    return;
  }
  
  if (!googleTokenClient) {
    console.warn("Client Google non initialisé, tentative de ré-initialisation...");
    initGoogleAuth();
    if (!googleTokenClient) {
      showToast("Le service Google n'est pas encore prêt. Réessayez dans une seconde.", "warning");
      return;
    }
  }
  
  // On ne force plus 'consent' pour éviter de re-valider les permissions à chaque fois.
  // Google réutilisera le consentement précédent.
  googleTokenClient.requestAccessToken({ prompt: '' });
}

function updateGoogleLoginButton() {
  const btn = document.getElementById('googleLoginBtn');
  if (btn && googleAccessToken) {
    btn.textContent = "Google Connecté";
    btn.classList.replace('button-secondary', 'button-primary');
  }
}

function normalizeCalendarName(name = "") {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function pickDecathlonCalendar(calendarItems = []) {
  const exactName = "decathlon - sync";
  // On cherche d'abord la correspondance exacte sur le nom normalisé
  const exactMatch = calendarItems.find(cal => normalizeCalendarName(cal.summary) === exactName);
  if (exactMatch) return exactMatch;

  // Sinon on cherche n'importe quel agenda contenant 'decathlon' mais en évitant l'adresse email si possible
  return calendarItems.find(cal => {
    const norm = normalizeCalendarName(cal.summary);
    return norm.includes("decathlon") && !norm.includes("@decathlon.com");
  }) || calendarItems.find(cal => normalizeCalendarName(cal.summary).includes("decathlon"));
}

async function fetchGoogleEvents(customStart, customEnd) {
  // 1. Vérifier et rafraîchir le token si nécessaire
  if (!googleAccessToken || Date.now() > (googleTokenExpiry - 60000)) {
    console.log("Token expiré ou proche de l'expiration, tentative de rafraîchissement silencieux...");
    if (googleTokenClient) {
      googleTokenClient.requestAccessToken({ prompt: '' });
      return; 
    }
  }

  if (!googleAccessToken || !calendar) return;

  try {
    let timeMin, timeMax;
    
    if (customStart && customEnd) {
      timeMin = customStart;
      timeMax = customEnd;
    } else if (calendar && calendar.view) {
      // Utiliser la plage visible du calendrier (indispensable pour le drag vers d'autres semaines)
      timeMin = calendar.view.activeStart;
      timeMax = calendar.view.activeEnd;
    } else {
      // Fallback
      const now = new Date();
      timeMin = new Date(now.setDate(now.getDate() - now.getDay() + 1));
      timeMin.setHours(0,0,0,0);
      timeMax = new Date(timeMin);
      timeMax.setDate(timeMax.getDate() + 7);
    }

    // 1. Récupérer la liste des agendas
    const listResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?' + new URLSearchParams({
      showHidden: 'true',
      maxResults: '250'
    }), {
      headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });
    
    if (!listResponse.ok) {
      throw new Error(`Erreur Google Calendar List (${listResponse.status})`);
    }
    
    const listData = await listResponse.json();
    console.log("Liste des agendas trouvés :", listData.items?.map(c => c.summary));

    const calendarsToFetch = [
      { id: 'primary', name: 'Mon Agenda' }
    ];

    // Sélection robuste de l'agenda Decathlon
    const decathlonCal = pickDecathlonCalendar(listData.items || []);

    if (decathlonCal) {
      console.log("Agenda Decathlon sélectionné :", decathlonCal.summary, "(ID:", decathlonCal.id, ")");
      calendarsToFetch.push({
        id: decathlonCal.id,
        name: decathlonCal.summary,
        accessRole: decathlonCal.accessRole,
        color: '#007abd', // Bleu Decathlon
        borderColor: '#005d8f'
      });
    }

    let allEvents = [];

    for (const cal of calendarsToFetch) {
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?` + new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: '1000'
      }), {
        headers: { 'Authorization': `Bearer ${googleAccessToken}` }
      });
      
      if (!response.ok) {
        console.warn(`Impossible de charger l'agenda ${cal.name}`);
        continue;
      }
      
      const data = await response.json();
      const events = (data.items || []).map(item => {
        const summary = item.summary || "";
        const isDecathlon = cal.id !== 'primary';
        const sourceClass = isDecathlon ? 'fc-event-source-decathlon' : 'fc-event-source-primary';
        const hasLimitedAccess = cal.accessRole === 'freeBusyReader';

        const cleanedDescription = cleanDescription(item.description);

        // Nettoyage complet du titre (emojis + préfixes de synchro)
        let cleanTitle = summary.replace(/^[☐✅]\s*/, "");
        cleanTitle = cleanTitle.replace(/^Travail sur\s*:\s*/i, "");
        cleanTitle = cleanTitle.replace(/^Working on\s*:\s*/i, "");
        cleanTitle = cleanTitle.trim();

        // Détection des tâches Google (☐ / ✅)
        const isGoogleTask = summary.startsWith('☐') || summary.startsWith('✅');
        const isTaskCompleted = summary.startsWith('✅');

        // Détection du pilier
        let pillarClass = '';
        if (isDecathlon) {
          pillarClass = 'fc-event-pillar-engineer'; // Decathlon = IET par défaut
        } else {
          // Si on n'est pas chez Decathlon, on essaiera de définir le pilier après avoir cherché la tâche locale
        }

        const displayTitle = cleanTitle || (hasLimitedAccess ? "Occupé (Accès limité)" : "(Sans titre)");
        
        // 1. Chercher par ID direct (si stocké dans l'événement Google)
        let localTaskId = item.extendedProperties?.private?.localTaskId;
        let localTask = null;

        if (localTaskId) {
          localTask = state.tasks.find(t => t.id === localTaskId);
        }

        // 2. Secours : Chercher par titre si pas d'ID ou si l'ID n'existe plus
        if (!localTask) {
          const searchTitle = displayTitle.trim().toLowerCase();
          localTask = state.tasks.find(t => t.title.trim().toLowerCase() === searchTitle);
          if (localTask) localTaskId = localTask.id;
        }

        // 3. Définir le pilier si on a trouvé une tâche locale
        if (localTask && !isDecathlon) {
          pillarClass = `fc-event-pillar-${localTask.pillar.toLowerCase()}`;
        }

        return {
          id: item.id,
          title: displayTitle,
          start: item.start.dateTime || item.start.date,
          end: item.end.dateTime || item.end.date,
          textColor: '#ffffff',
          className: [sourceClass, pillarClass, isGoogleTask ? 'fc-google-task' : ''].filter(Boolean),
          extendedProps: {
            localTaskId: localTaskId,
            googleEvent: {
              id: item.id,
              calendarId: cal.id,
              description: cleanedDescription,
              location: item.location,
              originalSummary: summary
            },
            isGoogleTask,
            isTaskCompleted,
            cleanTitle: displayTitle,
            calendarName: cal.name,
            calendarAccessRole: cal.accessRole || 'unknown',
            description: cleanedDescription,
            location: item.location || "",
            isDecathlon: isDecathlon
          }
        };
      });
      allEvents = allEvents.concat(events);
    }

    // Mise à jour du calendrier
    const existingSource = calendar.getEventSources()[0];
    if (existingSource) existingSource.remove();
    calendar.addEventSource(allEvents);
    
    showToast(`${allEvents.length} événements synchronisés`, "success");
  } catch (err) {
    console.error('Erreur lors de la récupération des événements Google:', err);
  }
}



let selectedEvent = null;

function showEventDetails(event) {
  selectedEvent = event;
  const props = event.extendedProps;
  
  document.getElementById('eventModalTitle').textContent = event.title;
  
  const startStr = event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endStr = event.end ? event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const dateStr = event.start.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('eventModalTime').textContent = `${dateStr}, ${startStr} - ${endStr}`;
  
  const descEl = document.getElementById('eventModalDescription');
  if (props.description) {
    document.getElementById('eventDescriptionContainer').style.display = 'block';
    descEl.textContent = props.description;
  } else {
    document.getElementById('eventDescriptionContainer').style.display = 'none';
  }
  
  const locEl = document.getElementById('eventModalLocation');
  if (props.location) {
    document.getElementById('eventLocationContainer').style.display = 'block';
    locEl.textContent = props.location;
  } else {
    document.getElementById('eventLocationContainer').style.display = 'none';
  }
  
  document.getElementById('eventModalCalendar').textContent = props.calendarName || "Principal";
  
  const modal = document.getElementById('eventDetailsModal');
  if (modal.showModal) {
    modal.showModal();
    document.body.classList.add('dialog-open');
  } else {
    modal.classList.add('active');
  }
}

// Toggle ☐ ↔ ✅ sur une tâche Google Calendar
async function toggleTaskCompletion(fcEvent) {
  if (!googleAccessToken) {
    showToast("Veuillez vous connecter à Google d'abord", "warning");
    return;
  }
  
  const googleEvent = fcEvent.extendedProps.googleEvent;
  if (!googleEvent) return;
  
  const calendarId = googleEvent.calendarId || 'primary';
  const eventId = googleEvent.id;
  const originalSummary = googleEvent.originalSummary || fcEvent.title;
  
  const wasCompleted = fcEvent.extendedProps.isTaskCompleted;
  const cleanTitle = fcEvent.extendedProps.cleanTitle || fcEvent.title;
  const newSummary = wasCompleted ? `☐ ${cleanTitle}` : `✅ ${cleanTitle}`;
  
  // Mise à jour visuelle instantanée
  fcEvent.setExtendedProp('isTaskCompleted', !wasCompleted);
  fcEvent.setExtendedProp('cleanTitle', cleanTitle);
  
  // Mettre à jour les classes CSS
  const currentClasses = fcEvent.classNames.filter(c => !c.includes('fc-google-task-done'));
  if (!wasCompleted) {
    currentClasses.push('fc-google-task-done');
  }
  fcEvent.setProp('classNames', currentClasses);
  
  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${googleAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ summary: newSummary })
      }
    );
    
    if (response.ok) {
      // Mettre à jour le originalSummary
      const updatedGoogleEvent = { ...googleEvent, originalSummary: newSummary };
      fcEvent.setExtendedProp('googleEvent', updatedGoogleEvent);
      showToast(wasCompleted ? `Tâche réouverte` : `Tâche terminée ✅`, "success");
    } else {
      // Revert en cas d'erreur
      fcEvent.setExtendedProp('isTaskCompleted', wasCompleted);
      throw new Error("Erreur API");
    }
  } catch (err) {
    console.error(err);
    showToast("Impossible de mettre à jour la tâche", "error");
  }
}

// Custom confirm dialog (remplace le confirm() natif)
function showConfirm(title, message, confirmLabel = "Supprimer") {
  return new Promise((resolve) => {
    const dialog = document.getElementById('confirmDialog');
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');

    titleEl.textContent = title;
    msgEl.textContent = message;
    okBtn.textContent = confirmLabel;

    const cleanup = (result) => {
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      if (dialog.close) dialog.close();
      resolve(result);
    };

    okBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    
    dialog.showModal();
    document.body.classList.add('dialog-open');
  });
}

async function deleteSelectedEvent() {
  if (!selectedEvent || !selectedEvent.extendedProps.googleEvent) return;
  
  const calendarId = selectedEvent.extendedProps.googleEvent.calendarId || 'primary';
  const eventId = selectedEvent.extendedProps.googleEvent.id;
  
  const confirmed = await showConfirm(
    "Supprimer l'événement",
    "Voulez-vous vraiment supprimer cet événement de votre Google Calendar ?"
  );
  if (!confirmed) return;
  
  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`
      }
    });
    
    if (response.ok) {
      selectedEvent.remove();
      const modal = document.getElementById('eventDetailsModal');
      if (modal.close) modal.close();
      else modal.classList.remove('active');
      showToast("Événement supprimé", "success");
    } else {
      throw new Error("Erreur lors de la suppression");
    }
  } catch (err) {
    console.error(err);
    showToast("Impossible de supprimer l'événement", "error");
  }
}

// Initialisation des boutons de la modale
function initEventModalListeners() {
  const modal = document.getElementById('eventDetailsModal');
  const closeBtn = document.getElementById('closeEventModalBtn');
  const deleteBtn = document.getElementById('deleteEventBtn');
  const editBtn = document.getElementById('editEventBtn');
  
  const closeModal = () => {
    if (modal.close) modal.close();
    else modal.classList.remove('active');
  };
  
  closeBtn.onclick = closeModal;
  deleteBtn.onclick = deleteSelectedEvent;
  
  editBtn.onclick = () => {
    if (!selectedEvent) return;
    
    const props = selectedEvent.extendedProps;
    const googleEvent = props.googleEvent;
    const eventId = googleEvent?.id;
    const calendarId = googleEvent?.calendarId || 'primary';
    
    // 1. Fermer la modale de détails
    closeModal();
    
    // 2. Chercher si une tâche locale correspond à cet événement
    const localTaskId = props.localTaskId;
    
    if (localTaskId) {
      openTaskDialog(localTaskId);
    } else {
      const cleanTitle = props.cleanTitle || selectedEvent.title;
      let taskByTitle = state.tasks.find(t => t.title === cleanTitle);
      openTaskDialog(taskByTitle ? taskByTitle.id : "");
    }
    
    // On remplit les IDs Google pour permettre la mise à jour synchrone
    document.querySelector("#editingGoogleEventId").value = eventId || "";
    document.querySelector("#editingGoogleCalendarId").value = calendarId || "";
    
    // On remplit les champs avec les infos de l'événement Google
    const titleInput = document.querySelector("#quickTitle");
    const descInput = document.querySelector("#quickDescription");
    const pillarInput = document.querySelector("#quickPillar");
    const dueDateInput = document.querySelector("#quickDueDate");
    const startInput = document.querySelector("#quickStartTime");
    const endInput = document.querySelector("#quickEndTime");
    const planningFields = document.getElementById('calendarPlanningFields');

    if (titleInput && !titleInput.value) titleInput.value = props.cleanTitle || selectedEvent.title;
    if (descInput && !descInput.value) descInput.value = props.description || "";
    if (dueDateInput && selectedEvent.start) {
      dueDateInput.value = selectedEvent.start.toISOString().split('T')[0];
    }
    
    if (planningFields && selectedEvent.start && selectedEvent.end) {
      planningFields.style.display = 'grid';
      if (startInput) startInput.value = selectedEvent.start.toTimeString().slice(0, 5);
      if (endInput) endInput.value = selectedEvent.end.toTimeString().slice(0, 5);
    }

    if (props.isDecathlon && pillarInput) {
      pillarInput.value = "projets";
    }
  };
  
  window.onclick = (event) => {
    if (event.target === modal) closeModal();
  };
}

async function updateGoogleEvent(calendarId, eventId, task, startTime, endTime) {
  if (!googleAccessToken) return false;
  
  const event = {
    'summary': task.title,
    'description': task.description || '',
    'start': { 'dateTime': startTime.toISOString() },
    'end': { 'dateTime': endTime.toISOString() },
    'extendedProperties': {
      'private': {
        'localTaskId': task.id
      }
    }
  };

  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });

    if (!response.ok) throw new Error('Erreur lors de la mise à jour Google Calendar');
    
    // Rafraîchir le calendrier pour voir le nouveau titre
    fetchGoogleEvents();
    return true;
  } catch (error) {
    console.error('Erreur updateGoogleEvent:', error);
    return false;
  }
}

async function createGoogleEvent(task, start, end) {
  try {
    const event = {
      'summary': task.title,
      'description': task.description || '',
      'start': { 'dateTime': start.toISOString() },
      'end': { 'dateTime': end.toISOString() },
      'extendedProperties': {
        'private': {
          'localTaskId': task.id
        }
      }
    };

    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });
    
    return response.ok;
  } catch (err) {
    console.error('Erreur lors de la création de l\'événement Google:', err);
    return false;
  }
}

function renderCalendarSidebar() {
  const filter = document.getElementById('calendarTaskFilter')?.value || "focus";
  const container = document.getElementById('externalTasksList');
  if (!container) return;
  
  const filteredTasks = state.tasks.filter(t => t.status === filter && isInDeepWorkContext(t));
  
  if (filteredTasks.length === 0) {
    container.innerHTML = `<div class="empty-state">Aucune tâche ${filter === 'focus' ? 'prioritaire' : 'planifiée'}.</div>`;
  } else {
    container.innerHTML = filteredTasks.map(taskCard).join('');
  }
}

// Dialogs & Actions
function openTaskDialog(taskId = "") {
  const task = taskId ? state.tasks.find(t => t.id === taskId) : null;
  const dialog = document.querySelector("#taskDialog");
  if (!dialog) return;

  // Réinitialiser les champs de planification et IDs Google
  const planningFields = document.getElementById('calendarPlanningFields');
  if (planningFields) planningFields.style.display = 'none';
  const startInput = document.getElementById('quickStartTime');
  const endInput = document.getElementById('quickEndTime');
  if (startInput) startInput.value = "";
  if (endInput) endInput.value = "";

  document.querySelector("#editingTaskId").value = task?.id || "";
  document.querySelector("#editingGoogleEventId").value = "";
  document.querySelector("#editingGoogleCalendarId").value = "";
  
  document.querySelector("#taskDialogKicker").textContent = task ? "Édition" : "Capture rapide";
  document.querySelector("#taskDialogTitle").textContent = task ? "Modifier la tâche" : "Ajouter une tâche";
  document.querySelector("#quickTitle").value = task?.title || "";
  document.querySelector("#quickDescription").value = task?.description || "";
  const currentPillar = task?.pillar || (state.deepWorkPillar === "all" ? pillars[0].id : state.deepWorkPillar);
  document.querySelector("#quickPillar").value = currentPillar;
  
  // Mettre à jour les projets filtrés pour ce pilier
  updateQuickProjectOptions(task?.projectId || "");

  document.querySelector("#quickStatus").value = task?.status || "inbox";
  document.querySelector("#quickDueDate").value = task?.dueDate || "";

  dialog.showModal();
  document.body.classList.add('dialog-open');
}

function openTaskDialogFromCalendar(start, end) {
  openTaskDialog(); // Reset & Open
  
  const planningFields = document.getElementById('calendarPlanningFields');
  if (planningFields) planningFields.style.display = 'grid';
  document.querySelector("#taskDialogTitle").textContent = "Planifier sur le calendrier";
  document.querySelector("#quickStatus").value = "focus"; // Par défaut en focus si on planifie
  
  // Remplir les dates et heures
  document.querySelector("#quickDueDate").value = start.toISOString().split('T')[0];
  document.querySelector("#quickStartTime").value = start.toTimeString().slice(0, 5);
  document.querySelector("#quickEndTime").value = end.toTimeString().slice(0, 5);
}

function openProjectDetail(id) {
  selectedProjectId = id;
  const project = projectById(id);
  if (!project) return;
  const dialog = document.querySelector("#projectDetailDialog");
  if (!dialog) return;

  const pillar = pillarById(project.pillar);
  document.querySelector("#detailPillar").textContent = pillar.label;
  document.querySelector("#detailTitle").textContent = project.name;
  document.querySelector("#detailDoneDefinition").textContent = project.doneDefinition || "";

  renderProjectTasks(id);
  dialog.showModal();
  document.body.classList.add('dialog-open');
}

function renderProjectTasks(projectId) {
  const container = document.querySelector("#projectTaskList");
  if (!container) return;
  const tasks = state.tasks.filter(t => t.projectId === projectId);
  container.innerHTML = tasks.length ? tasks.map(taskCard).join("") : '<div class="empty-state">Aucune tâche.</div>';
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

function escapeHTML(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Events
function initEventListeners() {
  const safeListen = (id, ev, fn) => { const el = document.querySelector(id); if (el) el.addEventListener(ev, fn); };

  safeListen("#quickAddForm", "submit", async (e) => {
    e.preventDefault();
    const id = document.querySelector("#editingTaskId").value;
    const title = document.querySelector("#quickTitle").value;
    const pillar = document.querySelector("#quickPillar").value;
    const projectId = document.querySelector("#quickProject").value;
    const status = document.querySelector("#quickStatus").value;
    const rawDescription = document.querySelector("#quickDescription").value;
    const description = cleanDescription(rawDescription);
    const dueDate = document.querySelector("#quickDueDate").value;

    const startTimeStr = document.getElementById('quickStartTime')?.value;
    const endTimeStr = document.getElementById('quickEndTime')?.value;

    let taskRef = null;
    if (id) {
      taskRef = await updateTask(id, { title, pillar, projectId, status, description, dueDate });
    } else {
      taskRef = await addTask(title, pillar, projectId);
    }

    // Synchronisation Google Calendar si heures présentes
    if (startTimeStr && endTimeStr && googleAccessToken) {
      const start = new Date(`${dueDate}T${startTimeStr}`);
      const end = new Date(`${dueDate}T${endTimeStr}`);
      const fullTask = state.tasks.find(t => t.id === (id || taskRef.id));
      
      const gEventId = document.querySelector("#editingGoogleEventId").value;
      const gCalId = document.querySelector("#editingGoogleCalendarId").value;
      
      if (gEventId && gCalId) {
        // On met à jour l'événement existant
        await updateGoogleEvent(gCalId, gEventId, fullTask, start, end);
        showToast("Événement mis à jour sur Google Calendar", "success");
      } else {
        // Nouveau : On crée un événement
        const success = await createGoogleEvent(fullTask, start, end);
        if (success) {
          showToast("Événement créé sur Google Calendar", "success");
          fetchGoogleEvents(); // Rafraîchir le calendrier
        }
      }
    }

    document.querySelector("#taskDialog").close();
  });

  safeListen("#openTaskDialog", "click", () => openTaskDialog());
  safeListen("#quickPillar", "change", () => updateQuickProjectOptions());
  safeListen("#closeTaskDialog", "click", () => document.querySelector("#taskDialog").close());
  safeListen("#contextSwitch", "change", (e) => { state.deepWorkPillar = e.target.value; persistAndRender(); });
  safeListen("#pillarFilter", "change", (e) => { state.filters.pillar = e.target.value; render(); });
  safeListen("#statusFilter", "change", (e) => { state.filters.status = e.target.value; render(); });
  safeListen("#showArchivesToggle", "change", (e) => { state.showArchives = e.target.checked; render(); });
  safeListen("#calendarTaskFilter", "change", () => renderCalendarSidebar());
  safeListen("#googleLoginBtn", "click", () => handleGoogleAuth());

  safeListen("#addProjectButton", "click", () => {
    document.querySelector("#editingProjectId").value = "";
    document.querySelector("#projectForm").reset();
    document.querySelector("#projectDialog h2").textContent = "Nouveau projet";
    document.querySelector("#projectDialog").showModal();
    document.body.classList.add('dialog-open');
  });
  safeListen("#projectForm", "submit", async (e) => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    await saveProject({
      id: document.querySelector("#editingProjectId").value,
      name: document.querySelector("#projectNameInput").value,
      pillar: document.querySelector("#projectPillarInput").value,
      doneDefinition: document.querySelector("#projectDoneInput").value,
      startDate: document.querySelector("#projectStartInput").value,
      dueDate: document.querySelector("#projectDueInput").value
    });
    document.querySelector("#projectDialog").close();
  });

  safeListen("#closeProjectDetail", "click", () => document.querySelector("#projectDetailDialog").close());
  safeListen("#addTaskToProject", "click", () => {
    document.querySelector("#projectDetailDialog").close();
    openTaskDialog();
    const quickProject = document.querySelector("#quickProject");
    if (quickProject && selectedProjectId) {
      quickProject.value = selectedProjectId;
    }
  });

  safeListen("#editProjectButton", "click", () => {
    const project = projectById(selectedProjectId);
    if (!project) return;

    document.querySelector("#editingProjectId").value = project.id;
    document.querySelector("#projectNameInput").value = project.name;
    document.querySelector("#projectPillarInput").value = project.pillar;
    document.querySelector("#projectDoneInput").value = project.doneDefinition || "";
    document.querySelector("#projectStartInput").value = project.startDate || "";
    document.querySelector("#projectDueInput").value = project.dueDate || "";

    document.querySelector("#projectDialog h2").textContent = "Modifier le projet";
    document.querySelector("#projectDialog").showModal();
    document.body.classList.add('dialog-open');
  });

  safeListen("#deleteProjectButton", "click", async () => {
    if (selectedProjectId) {
      await deleteProject(selectedProjectId);
      document.querySelector("#projectDetailDialog").close();
    }
  });

  safeListen("#archiveTasksButton", "click", async () => {
    const doneTasks = state.tasks.filter(t => t.status === "done");
    if (doneTasks.length === 0) {
      showToast("Aucune tâche terminée à archiver.", "info");
      return;
    }

    if (confirm(`Archiver ${doneTasks.length} tâches terminées ?`)) {
      state.tasks = state.tasks.filter(t => t.status !== "done");
      persistAndRender();

      if (supabase) {
        const { error } = await supabase.from('tasks').delete().eq('status', 'done');
        if (error) {
          console.error("Erreur d'archivage Supabase:", error);
          showToast("Erreur lors de l'archivage cloud.", "error");
        } else {
          showToast(`${doneTasks.length} tâches archivées avec succès.`, "success");
        }
      } else {
        showToast(`${doneTasks.length} tâches archivées localement.`, "success");
      }
    }
  });

  const tabGroup = document.querySelector(".view-tabs-group");
  const updateTabIndicator = () => {
    const activeTab = tabGroup?.querySelector(".tab-button.active");
    if (!tabGroup || !activeTab) return;
    tabGroup.style.setProperty("--tab-indicator-left", `${activeTab.offsetLeft}px`);
    tabGroup.style.setProperty("--tab-indicator-width", `${activeTab.offsetWidth}px`);
  };

  updateTabIndicator();
  window.addEventListener("resize", updateTabIndicator);

  document.querySelectorAll(".tab-button").forEach(btn => {
    btn.addEventListener("click", () => {
      currentView = btn.dataset.view;
      document.querySelectorAll(".tab-button").forEach(b => b.classList.toggle("active", b === btn));
      updateTabIndicator();
      document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `${currentView}View`));
      render();
    });
  });

  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (["focus", "planned", "done"].includes(action)) setTaskStatus(id, action);
    if (action === "edit-task") openTaskDialog(id);
    if (action === "delete") deleteTask(id);
    if (action === "open-project") openProjectDetail(id);
  });

  document.querySelectorAll("dialog").forEach(d => {
    d.addEventListener('close', () => {
      // Remove scroll lock only if no other dialog is still open
      const anyOpen = [...document.querySelectorAll('dialog')].some(dlg => dlg.open);
      if (!anyOpen) document.body.classList.remove('dialog-open');
    });
    d.onclick = (e) => { if (e.target === d) d.close(); };
  });

  // Auth form handlers
  let authMode = "login";
  safeListen("#toggleAuthMode", "click", (e) => {
    e.preventDefault();
    authMode = authMode === "login" ? "signup" : "login";
    document.querySelector("#authSubmit").textContent = authMode === "login" ? "Se connecter" : "S'inscrire";
    document.querySelector("#toggleAuthMode").textContent = authMode === "login" ? "S'inscrire" : "Se connecter";
    document.querySelector(".auth-card h2").textContent = authMode === "login" ? "Connexion au Dashboard" : "Création de compte";
  });

  safeListen("#authForm", "submit", async (e) => {
    e.preventDefault();
    const email = document.querySelector("#authEmail").value;
    const password = document.querySelector("#authPassword").value;
    const errorEl = document.querySelector("#authError");
    const submitBtn = document.querySelector("#authSubmit");

    errorEl.classList.add("hidden");
    submitBtn.disabled = true;
    submitBtn.textContent = "Chargement...";

    try {
      let result;
      if (authMode === "login") {
        result = await supabase.auth.signInWithPassword({ email, password });
      } else {
        result = await supabase.auth.signUp({ email, password });
      }

      if (result.error) {
        errorEl.textContent = result.error.message;
        errorEl.classList.remove("hidden");
      }
    } catch (err) {
      errorEl.textContent = "Une erreur est survenue.";
      errorEl.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = authMode === "login" ? "Se connecter" : "S'inscrire";
    }
  });

  safeListen("#logoutButton", "click", async () => {
    if (confirm("Se déconnecter ?")) {
      await supabase.auth.signOut();
    }
  });
}

function persistAndRender() {
  saveState();
  render();
}

function initDragAndDrop() {
  const cards = document.querySelectorAll(".task-card");
  const lanes = document.querySelectorAll(".work-lane");

  cards.forEach(card => {
    card.addEventListener("dragstart", () => {
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
    });
  });

  lanes.forEach(lane => {
    lane.addEventListener("dragover", (e) => {
      e.preventDefault();
      lane.classList.add("drag-over");
    });

    lane.addEventListener("dragleave", () => {
      lane.classList.remove("drag-over");
    });

    lane.addEventListener("drop", (e) => {
      e.preventDefault();
      lane.classList.remove("drag-over");
      const draggingCard = document.querySelector(".dragging");
      if (!draggingCard) return;

      const taskId = draggingCard.dataset.taskId;
      const nextStatus = lane.dataset.laneId;

      if (nextStatus) {
        setTaskStatus(taskId, nextStatus);
      }
    });
  });
}

async function init() {
  initEventListeners();
  initEventModalListeners();
  render(); // Instant local
  if (supabase) {
    await initAuth();
    initGoogleAuth();
  } else {
    state = await loadState();
    render();
    initGoogleAuth();
  }
}

init();
