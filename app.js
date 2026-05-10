import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.error("Erreur lors de l'initialisation de Supabase:", e);
  }
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
      console.error("Erreur Supabase:", pRes.error || tRes.error);
      return { ...seedState, ...localData };
    }

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
    createdAt: new Date().toISOString(),
    dueDate: document.querySelector("#quickDueDate")?.value || null
  };

  state.tasks.unshift(newTask);
  persistAndRender();

  if (supabase) {
    try {
      await supabase.from('tasks').insert([{
        id: newTask.id,
        title: newTask.title,
        description: newTask.description,
        pillar: newTask.pillar,
        project_id: newTask.projectId || null,
        status: newTask.status,
        created_at: newTask.createdAt,
        due_date: newTask.dueDate
      }]);
    } catch (e) { console.error("Erreur synchro insert:", e); }
  }
}

async function updateTask(id, updates) {
  const index = state.tasks.findIndex(t => t.id === id);
  if (index === -1) return;

  state.tasks[index] = { ...state.tasks[index], ...updates };
  persistAndRender();

  if (supabase) {
    try {
      const dbUpdates = {
        title: updates.title,
        description: updates.description,
        pillar: updates.pillar,
        project_id: updates.projectId === undefined ? undefined : (updates.projectId || null),
        status: updates.status,
        due_date: updates.dueDate
      };
      Object.keys(dbUpdates).forEach(key => dbUpdates[key] === undefined && delete dbUpdates[key]);
      await supabase.from('tasks').update(dbUpdates).eq('id', id);
    } catch (e) { console.error("Erreur synchro update:", e); }
  }
}

async function deleteTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  if (!confirm(`Supprimer \"${task.title}\" ?`)) return;

  state.tasks = state.tasks.filter(t => t.id !== id);
  persistAndRender();

  if (supabase) {
    try {
      await supabase.from('tasks').delete().eq('id', id);
    } catch (e) { console.error("Erreur synchro delete:", e); }
  }
}

async function setTaskStatus(id, status) {
  if (status === "focus") {
    const focusCount = state.tasks.filter(t => t.status === "focus").length;
    if (focusCount >= 3) {
      showToast("Limite de 3 priorités atteinte !", "warning");
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
    if (supabase) await supabase.from('projects').update(dbProject).eq('id', id);
  } else {
    state.projects.push({ ...dbProject, doneDefinition, startDate, dueDate, createdAt: dbProject.created_at });
    if (supabase) await supabase.from('projects').insert([dbProject]);
  }
  persistAndRender();
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
    } else if (currentView === "review") {
      renderReview();
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
  const pillarOptions = pillars.map(p => `<option value=\"${p.id}\">${p.label}</option>`).join("");
  const projectOptions = state.projects.map(p => `<option value=\"${p.id}\">${escapeHTML(p.name)}</option>`).join("");
  const statusOptions = statuses.map(s => `<option value=\"${s.id}\">${s.label}</option>`).join("");

  const safeSetHTML = (id, html) => { const el = document.querySelector(id); if (el) el.innerHTML = html; };
  safeSetHTML("#quickPillar", pillarOptions);
  safeSetHTML("#projectPillarInput", pillarOptions);
  safeSetHTML("#contextSwitch", `<option value=\"all\">Tous les piliers</option>${pillarOptions}`);
  safeSetHTML("#pillarFilter", `<option value=\"all\">Tous</option>${pillarOptions}`);
  safeSetHTML("#quickProject", `<option value=\"\">Sans projet</option>${projectOptions}`);
  safeSetHTML("#quickStatus", statusOptions);

  const safeSetVal = (id, val) => { const el = document.querySelector(id); if (el) el.value = val; };
  safeSetVal("#contextSwitch", state.deepWorkPillar);
  safeSetVal("#pillarFilter", state.filters.pillar);
  safeSetVal("#statusFilter", state.filters.status);
  const sat = document.querySelector("#showArchivesToggle"); if (sat) sat.checked = !!state.showArchives;
}

function renderMetrics() {
  const focusTasks = state.tasks.filter(t => t.status === "focus" && isInDeepWorkContext(t));
  const el = document.querySelector("#focusCount");
  if (el) {
    el.textContent = `${focusTasks.length}/3`;
    el.classList.toggle("warning", focusTasks.length >= 3);
  }
  const fw = document.querySelector("#focusWarning");
  if (fw) fw.classList.toggle("hidden", focusTasks.length <= 3);
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
  container.innerHTML = tasks.length ? tasks.map(taskCard).join("") : `<div class=\"empty-state\">${emptyText}</div>`;
}

function renderWorkPlan(tasks) {
  const container = document.querySelector("#workPlan");
  if (!container) return;

  const body = [
    workPlanLane({ id: "focus", title: "Priorités du jour", hint: "Max 3. Décision immédiate.", tasks: tasks.filter(t => t.status === "focus"), featured: true }),
    ...workPlanGroups.map(group => workPlanLane({ ...group, tasks: tasks.filter(t => t.status === group.id) }))
  ].join("");

  container.innerHTML = body;
  container.classList.toggle("focus-mode", !state.showArchives);
}

function workPlanLane(group) {
  const isVisible = state.showArchives || !["blocked", "done"].includes(group.id);
  if (!isVisible) return "";

  return `
    <section class=\"work-lane ${group.featured ? 'work-lane-featured' : ''}\" data-lane-id=\"${group.id}\">
      <div class=\"work-lane-header\">
        <div><h3>${group.title}</h3><p>${group.hint}</p></div>
        <span>${group.tasks.length}</span>
      </div>
      <div class=\"work-lane-body\">
        ${group.tasks.length ? group.tasks.map(taskCard).join("") : '<div class=\"empty-state\">Rien ici.</div>'}
      </div>
    </section>
  `;
}

function taskCard(task) {
  const pillar = pillarById(task.pillar);
  const project = projectById(task.projectId);
  const isDone = task.status === "done";

  return `
    <article class=\"task-card ${isDone ? 'done' : ''}\" data-task-id=\"${task.id}\" tabindex=\"0\">
      <div class=\"task-main\">
        <div class=\"task-content-wrapper\">
          <p class=\"task-title\">${escapeHTML(task.title)}</p>
          ${task.description ? `<p class=\"task-description\">${escapeHTML(task.description)}</p>` : ''}
          <div class=\"meta-row\">
            <span class=\"pill\" style=\"--pillar-color: ${pillar.color}\">
              <span class=\"pillar-dot\"></span>${pillar.label}
            </span>
            <span>${project ? escapeHTML(project.name) : 'Sans projet'}</span>
            ${task.dueDate ? `<span>${task.dueDate}</span>` : ''}
          </div>
        </div>
        <div class=\"task-actions\">${taskActions(task)}</div>
      </div>
    </article>
  `;
}

function taskActions(task) {
  const actions = [];
  const focusDisabled = state.tasks.filter(t => t.status === "focus").length >= 3 && task.status !== "focus";

  if (task.status !== "focus" && task.status !== "done") {
    actions.push(`<button class=\"action-button\" data-action=\"focus\" data-id=\"${task.id}\" ${focusDisabled ? 'disabled' : ''}>${ICONS.focus}<span>Prioriser</span></button>`);
  }
  if (task.status !== "planned" && task.status !== "done") {
    actions.push(`<button class=\"action-button\" data-action=\"planned\" data-id=\"${task.id}\">${ICONS.plan}<span>Planifier</span></button>`);
  }
  if (task.status !== "done") {
    actions.push(`<button class=\"action-button action-done\" data-action=\"done\" data-id=\"${task.id}\">${ICONS.check}</button>`);
  } else {
    actions.push(`<button class=\"action-button\" data-action=\"planned\" data-id=\"${task.id}\">${ICONS.reopen}<span>Réouvrir</span></button>`);
  }
  actions.push(`<button class=\"action-button\" data-action=\"edit-task\" data-id=\"${task.id}\">${ICONS.edit}</button>`);
  actions.push(`<button class=\"action-button action-danger\" data-action=\"delete\" data-id=\"${task.id}\">${ICONS.trash}</button>`);

  return actions.join("");
}

// Projets & Gantt
function renderProjects() {
  const container = document.querySelector("#projectList");
  if (!container) return;
  const contextProjects = state.projects.filter(isInDeepWorkContext);
  container.innerHTML = contextProjects.length ? contextProjects.map(projectCard).join("") : `<div class=\"empty-state\">Aucun projet.</div>`;
  renderGantt();
}

function projectCard(project) {
  const pillar = pillarById(project.pillar);
  const progress = projectProgress(project.id);
  const nextAction = state.tasks.find(t => t.projectId === project.id && t.status !== "done");

  return `
    <article class=\"project-card\" data-action=\"open-project\" data-id=\"${project.id}\">
      <div class=\"project-top\">
        <div><h3>${escapeHTML(project.name)}</h3>
          <div class=\"meta-row\">
            <span class=\"pill\" style=\"--pillar-color: ${pillar.color}\"><span class=\"pillar-dot\"></span>${pillar.label}</span>
            <span>${progress}% complété</span>
          </div>
        </div>
        ${project.dueDate ? `<span class=\"deadline-badge\">${project.dueDate}</span>` : ''}
      </div>
      <p class=\"muted\" style=\"font-size: 13px; margin: 8px 0;\">${escapeHTML(project.doneDefinition || '')}</p>
      <div class=\"meta-row\">
        <span class=\"muted\">Suivant :</span>
        <strong>${nextAction ? escapeHTML(nextAction.title) : 'À définir'}</strong>
      </div>
    </article>
  `;
}

function renderGantt() {
  const container = document.querySelector("#ganttTimeline");
  if (!container) return;
  const projects = state.projects.filter(p => p.status === "active" && isInDeepWorkContext(p));
  if (!projects.length) { container.innerHTML = \"\"; return; }

  const now = new Date();
  let startRange = new Date(now.getTime() - 7 * 86400000);
  let endRange = new Date(now.getTime() + 30 * 86400000);

  const totalDays = Math.ceil((endRange - startRange) / 86400000);
  container.style.minWidth = `${totalDays * 30}px`;

  container.innerHTML = projects.map(p => {
    const pillar = pillarById(p.pillar);
    const pStart = new Date(p.startDate || p.createdAt);
    const pEnd = p.dueDate ? new Date(p.dueDate) : new Date(pStart.getTime() + 14 * 86400000);
    const left = Math.max(0, ((pStart - startRange) / (endRange - startRange)) * 100);
    const width = Math.max(5, ((pEnd - pStart) / (endRange - startRange)) * 100);
    
    return `
      <div class=\"gantt-row\">
        <div class=\"gantt-project-name\">${escapeHTML(p.name)}</div>
        <div class=\"gantt-track\">
          <div class=\"gantt-bar\" style=\"left: ${left}%; width: ${width}%; background: ${pillar.color}\"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderReview() {
  const inboxCount = state.tasks.filter(t => t.status === "inbox").length;
  const projectCount = state.projects.length;
  const doneCount = state.tasks.filter(t => t.status === "done").length;

  const safeSetText = (id, text) => { const el = document.querySelector(id); if (el) el.innerHTML = text; };
  safeSetText("#reviewInboxStats", `<strong>${inboxCount}</strong> tâches à trier.`);
  safeSetText("#reviewProjectStats", `<strong>${projectCount}</strong> projets actifs.`);
  safeSetText("#reviewWeekStats", `<strong>${doneCount}</strong> tâches terminées.`);
}

// Dialogs & Actions
function openTaskDialog(taskId = "") {
  const task = taskId ? state.tasks.find(t => t.id === taskId) : null;
  const dialog = document.querySelector("#taskDialog");
  if (!dialog) return;

  document.querySelector("#editingTaskId").value = task?.id || "";
  document.querySelector("#taskDialogTitle").textContent = task ? "Modifier la tâche" : "Capture rapide";
  document.querySelector("#quickTitle").value = task?.title || "";
  document.querySelector("#quickDescription").value = task?.description || "";
  document.querySelector("#quickPillar").value = task?.pillar || (state.deepWorkPillar === "all" ? pillars[0].id : state.deepWorkPillar);
  document.querySelector("#quickProject").value = task?.projectId || "";
  document.querySelector("#quickStatus").value = task?.status || "inbox";
  document.querySelector("#quickDueDate").value = task?.dueDate || "";

  dialog.showModal();
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
}

function renderProjectTasks(projectId) {
  const container = document.querySelector("#projectTaskList");
  if (!container) return;
  const tasks = state.tasks.filter(t => t.projectId === projectId);
  container.innerHTML = tasks.length ? tasks.map(taskCard).join("") : '<div class=\"empty-state\">Aucune tâche.</div>';
}

function showToast(message, type = \"info\") {
  const container = document.querySelector(\"#toastContainer\");
  if (!container) return;
  const toast = document.createElement(\"div\");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add(\"fade-out\"); setTimeout(() => toast.remove(), 500); }, 3000);
}

function escapeHTML(str) {
  if (!str) return \"\";
  const div = document.createElement(\"div\");
  div.textContent = str;
  return div.innerHTML;
}

// Events
function initEventListeners() {
  const safeListen = (id, ev, fn) => { const el = document.querySelector(id); if (el) el.addEventListener(ev, fn); };

  safeListen(\"#quickAddForm\", \"submit\", async (e) => {
    e.preventDefault();
    const id = document.querySelector(\"#editingTaskId\").value;
    const title = document.querySelector(\"#quickTitle\").value;
    const pillar = document.querySelector(\"#quickPillar\").value;
    const projectId = document.querySelector(\"#quickProject\").value;
    if (id) {
      await updateTask(id, { 
        title, pillar, projectId, 
        status: document.querySelector(\"#quickStatus\").value,
        description: document.querySelector(\"#quickDescription\").value,
        dueDate: document.querySelector(\"#quickDueDate\").value
      });
    } else {
      await addTask(title, pillar, projectId);
    }
    document.querySelector(\"#taskDialog\").close();
  });

  safeListen(\"#openTaskDialog\", \"click\", () => openTaskDialog());
  safeListen(\"#closeTaskDialog\", \"click\", () => document.querySelector(\"#taskDialog\").close());
  safeListen(\"#contextSwitch\", \"change\", (e) => { state.deepWorkPillar = e.target.value; persistAndRender(); });
  safeListen(\"#pillarFilter\", \"change\", (e) => { state.filters.pillar = e.target.value; render(); });
  safeListen(\"#statusFilter\", \"change\", (e) => { state.filters.status = e.target.value; render(); });
  safeListen(\"#showArchivesToggle\", \"change\", (e) => { state.showArchives = e.target.checked; render(); });

  safeListen(\"#addProjectButton\", \"click\", () => document.querySelector(\"#projectDialog\").showModal());
  safeListen(\"#projectForm\", \"submit\", async (e) => {
    if (e.submitter?.value === \"cancel\") return;
    e.preventDefault();
    await saveProject({
      name: document.querySelector(\"#projectNameInput\").value,
      pillar: document.querySelector(\"#projectPillarInput\").value,
      doneDefinition: document.querySelector(\"#projectDoneInput\").value,
      startDate: document.querySelector(\"#projectStartInput\").value,
      dueDate: document.querySelector(\"#projectDueInput\").value
    });
    document.querySelector(\"#projectDialog\").close();
  });

  safeListen(\"#closeProjectDetail\", \"click\", () => document.querySelector(\"#projectDetailDialog\").close());
  safeListen(\"#archiveWeekButton\", \"click\", () => { 
    if (confirm(\"Archiver les tâches terminées ?\")) {
      state.tasks = state.tasks.filter(t => t.status !== \"done\");
      persistAndRender();
    }
  });

  document.querySelectorAll(\".tab-button\").forEach(btn => {
    btn.addEventListener(\"click\", () => {
      currentView = btn.dataset.view;
      document.querySelectorAll(\".tab-button\").forEach(b => b.classList.toggle(\"active\", b === btn));
      document.querySelectorAll(\".view\").forEach(v => v.classList.toggle(\"active\", v.id === `${currentView}View`));
      render();
    });
  });

  document.body.addEventListener(\"click\", (e) => {
    const btn = e.target.closest(\"[data-action]\");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if ([\"focus\", \"planned\", \"done\"].includes(action)) setTaskStatus(id, action);
    if (action === \"edit-task\") openTaskDialog(id);
    if (action === \"delete\") deleteTask(id);
    if (action === \"open-project\") openProjectDetail(id);
  });

  document.querySelectorAll(\"dialog\").forEach(d => d.onclick = (e) => { if (e.target === d) d.close(); });
}

function persistAndRender() { saveState(); render(); }

async function init() {
  initEventListeners();
  render(); // Instant local
  state = await loadState();
  render(); // Final sync
}

init();
