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
};

const todayISO = () => new Date().toISOString().slice(0, 10);

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

    console.log("Appel Supabase...");
    const [pRes, tRes] = await Promise.all([
      fetchWithTimeout(supabase.from('projects').select('*')),
      fetchWithTimeout(supabase.from('tasks').select('*'))
    ]);
    
    if (pRes.error || tRes.error) {
      console.error("Erreur Supabase détectée:", pRes.error || tRes.error);
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

    console.log("Données Supabase chargées avec succès.");
    return {
      ...seedState,
      ...localData,
      projects: mappedProjects,
      tasks: mappedTasks,
    };
  } catch (e) {
    console.error("Échec du chargement cloud (basculement local):", e);
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
    id: `task_${Date.now()}`,
    title,
    description: "",
    pillar,
    projectId,
    status: "inbox",
    createdAt: new Date().toISOString(),
  };

  state.tasks.push(newTask);
  persistAndRender();

  if (supabase) {
    try {
      await supabase.from('tasks').insert([{
        id: newTask.id,
        title: newTask.title,
        pillar: newTask.pillar,
        project_id: newTask.projectId || null,
        status: newTask.status,
        created_at: newTask.createdAt
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
        project_id: updates.projectId || null,
        status: updates.status,
        due_date: updates.dueDate
      };
      Object.keys(dbUpdates).forEach(key => dbUpdates[key] === undefined && delete dbUpdates[key]);
      
      await supabase.from('tasks').update(dbUpdates).eq('id', id);
    } catch (e) { console.error("Erreur synchro update:", e); }
  }
}

async function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  persistAndRender();

  if (supabase) {
    try {
      await supabase.from('tasks').delete().eq('id', id);
    } catch (e) { console.error("Erreur synchro delete:", e); }
  }
}

async function setTaskStatus(id, status) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  
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
async function addProject(name, pillar, doneDefinition, startDate, dueDate) {
  const newProject = {
    id: `project_${Date.now()}`,
    name,
    pillar,
    doneDefinition,
    status: "active",
    createdAt: new Date().toISOString(),
    startDate,
    dueDate
  };

  state.projects.push(newProject);
  persistAndRender();

  if (supabase) {
    try {
      await supabase.from('projects').insert([{
        id: newProject.id,
        name: newProject.name,
        pillar: newProject.pillar,
        done_definition: newProject.doneDefinition,
        status: newProject.status,
        created_at: newProject.createdAt,
        start_date: newProject.startDate,
        due_date: newProject.dueDate
      }]);
    } catch (e) { console.error("Erreur synchro project insert:", e); }
  }
}

async function updateProject(id, updates) {
  const index = state.projects.findIndex(p => p.id === id);
  if (index === -1) return;

  state.projects[index] = { ...state.projects[index], ...updates };
  persistAndRender();

  if (supabase) {
    try {
      const dbUpdates = {
        name: updates.name,
        pillar: updates.pillar,
        done_definition: updates.doneDefinition,
        status: updates.status,
        start_date: updates.startDate,
        due_date: updates.dueDate
      };
      Object.keys(dbUpdates).forEach(key => dbUpdates[key] === undefined && delete dbUpdates[key]);
      await supabase.from('projects').update(dbUpdates).eq('id', id);
    } catch (e) { console.error("Erreur synchro project update:", e); }
  }
}

async function deleteProject(id) {
  state.projects = state.projects.filter(p => p.id !== id);
  state.tasks = state.tasks.filter(t => t.projectId !== id);
  persistAndRender();

  if (supabase) {
    try {
      await Promise.all([
        supabase.from('tasks').delete().eq('project_id', id),
        supabase.from('projects').delete().eq('id', id)
      ]);
    } catch (e) { console.error("Erreur synchro project delete:", e); }
  }
}

// Helpers
function pillarById(id) {
  return pillars.find((pillar) => pillar.id === id) || pillars[pillars.length - 1];
}

function projectById(id) {
  return state.projects.find((p) => p.id === id);
}

function isInDeepWorkContext(item) {
  if (state.deepWorkPillar === "all") return true;
  return item.pillar === state.deepWorkPillar;
}

function projectProgress(projectId) {
  const projectTasks = state.tasks.filter((t) => t.projectId === projectId);
  if (projectTasks.length === 0) return 0;
  const doneTasks = projectTasks.filter((t) => t.status === "done");
  return Math.round((doneTasks.length / projectTasks.length) * 100);
}

async function archiveDoneTasks() {
  const doneTasks = state.tasks.filter(t => t.status === "done");
  if (doneTasks.length === 0) {
    showToast("Aucune tâche terminée à archiver", "info");
    return;
  }

  if (confirm(`Archiver ${doneTasks.length} tâches ?`)) {
    const doneIds = doneTasks.map(t => t.id);
    state.tasks = state.tasks.filter(t => t.status !== "done");
    persistAndRender();

    if (supabase) {
      try {
        await supabase.from('tasks').delete().in('id', doneIds);
      } catch (e) { console.error("Erreur archivage:", e); }
    }
    showToast("Tâches archivées", "success");
  }
}

async function resetDailyFocus() {
  const focusIds = state.tasks.filter(t => t.status === "focus").map(t => t.id);
  state.tasks = state.tasks.map(t => t.status === "focus" ? { ...t, status: "planned" } : t);
  persistAndRender();

  if (supabase) {
    try {
      await supabase.from('tasks').update({ status: 'planned' }).in('id', focusIds);
    } catch (e) { console.error("Erreur reset focus:", e); }
  }
}

// Rendu
function render() {
  try {
    renderContextAccent();
    renderSelectOptions();
    renderMetrics();

    const view = currentView;
    if (view === "cockpit") {
      renderTaskSections();
    } else if (view === "map") {
      renderProjects();
    } else if (view === "review") {
      renderReview();
    }
  } catch (e) {
    console.error("Erreur fatale lors du rendu:", e);
  }
}

function renderContextAccent() {
  const contextPillar = state.deepWorkPillar === "all" ? null : pillarById(state.deepWorkPillar);
  const el = document.querySelector(".app-shell"); // Select shell or body
  document.body.dataset.context = contextPillar?.id || "all";
  document.body.style.setProperty("--context-accent", contextPillar?.color || "#ededed");
}

function renderSelectOptions() {
  const quickPillarCurrent = document.querySelector("#quickPillar")?.value;
  
  const pillarOptions = pillars
    .map((pillar) => `<option value="${pillar.id}">${pillar.label}</option>`)
    .join("");
  
  const statusOptions = statuses
    .map((status) => `<option value="${status.id}">${status.label}</option>`)
    .join("");
  
  const projectOptions = state.projects
    .map((project) => `<option value="${project.id}">${escapeHTML(project.name)}</option>`)
    .join("");

  const updateHTML = (id, html) => {
    const el = document.querySelector(id);
    if (el) el.innerHTML = html;
  };

  updateHTML("#quickPillar", pillarOptions);
  updateHTML("#projectPillarInput", pillarOptions);
  updateHTML("#contextSwitch", `<option value="all">Tous les piliers</option>${pillarOptions}`);
  updateHTML("#pillarFilter", `<option value="all">Tous les piliers</option>${pillarOptions}`);
  updateHTML("#quickProject", `<option value="">Sans projet</option>${projectOptions}`);
  updateHTML("#quickStatus", statusOptions);

  const qp = document.querySelector("#quickPillar");
  if (qp) {
    qp.value = state.deepWorkPillar === "all" ? quickPillarCurrent || pillars[0].id : state.deepWorkPillar;
  }
  const cs = document.querySelector("#contextSwitch");
  if (cs) cs.value = state.deepWorkPillar;
  const pf = document.querySelector("#pillarFilter");
  if (pf) pf.value = state.filters.pillar;
  const sf = document.querySelector("#statusFilter");
  if (sf) sf.value = state.filters.status;
  const sa = document.querySelector("#showArchivesToggle");
  if (sa) sa.checked = !!state.showArchives;
}

function renderMetrics() {
  const focusTasks = state.tasks.filter(t => t.status === "focus");
  const el = document.querySelector("#focusCount");
  if (el) {
    el.textContent = `${focusTasks.length}/3`;
    el.classList.toggle("warning", focusTasks.length >= 3);
  }
}

function renderTaskSections() {
  renderTasks("focus", "#focusList");
  renderTasks("inbox", "#inboxList");
  renderWorkPlan();
}

function renderTasks(status, containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  const tasks = state.tasks.filter((task) => task.status === status && isInDeepWorkContext(task));
  
  if (tasks.length === 0) {
    container.innerHTML = `<div class="empty-state">Aucune tâche ici.</div>`;
    return;
  }

  container.innerHTML = tasks.map(taskCard).join("");
}

function renderWorkPlan() {
  const container = document.querySelector("#workPlan");
  if (!container) return;

  const visibleStatuses = state.showArchives ? ["planned", "blocked", "done"] : ["planned"];
  
  container.innerHTML = workPlanGroups
    .filter(group => visibleStatuses.includes(group.id))
    .map(group => {
      const groupTasks = state.tasks.filter(t => 
        t.status === group.id && 
        isInDeepWorkContext(t) &&
        (state.filters.pillar === "all" || t.pillar === state.filters.pillar)
      );
      
      return `
        <div class="work-lane">
          <div class="lane-header">
            <h3>${group.title}</h3>
            <span class="count">${groupTasks.length}</span>
          </div>
          <div class="task-list">
            ${groupTasks.length ? groupTasks.map(taskCard).join("") : '<div class="empty-state">Vide</div>'}
          </div>
        </div>
      `;
    }).join("");
}

function taskCard(task) {
  const pillar = pillarById(task.pillar);
  const project = task.projectId ? projectById(task.projectId) : null;
  const isDone = task.status === "done";

  return `
    <div class="task-card ${isDone ? 'done' : ''}" data-id="${task.id}">
      <div class="task-card-main">
        <button class="check-button" data-action="toggle-status" data-id="${task.id}" title="Marquer comme fait">
          ${task.status === 'done' ? '<svg class="icon" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>' : ''}
        </button>
        <div class="task-content">
          <div class="task-title">${escapeHTML(task.title)}</div>
          <div class="task-meta">
            <span class="pillar-tag" style="background: ${pillar.color}22; color: ${pillar.color}">
              ${pillar.label}
            </span>
            ${project ? `<span class="project-tag">${escapeHTML(project.name)}</span>` : ""}
          </div>
        </div>
        <div class="task-actions">
          ${task.status !== 'focus' && !isDone ? `<button class="action-btn" data-action="focus" data-id="${task.id}" title="Priorité jour">★</button>` : ''}
          <button class="action-btn" data-action="edit-task" data-id="${task.id}" title="Modifier">✎</button>
          <button class="action-btn danger" data-action="delete" data-id="${task.id}" title="Supprimer">×</button>
        </div>
      </div>
    </div>
  `;
}

function renderProjects() {
  const container = document.querySelector("#projectList");
  if (!container) return;

  const contextProjects = state.projects.filter(isInDeepWorkContext);
  container.innerHTML = contextProjects.length
    ? contextProjects.map(projectCard).join("")
    : `<div class="empty-state">Aucun projet actif.</div>`;
}

function projectCard(project) {
  const pillar = pillarById(project.pillar);
  const progress = projectProgress(project.id);
  
  return `
    <div class="project-card" data-action="open-project" data-id="${project.id}">
      <div class="project-card-header">
        <span class="pillar-dot" style="background: ${pillar.color}"></span>
        <h3>${escapeHTML(project.name)}</h3>
      </div>
      <div class="progress-container">
        <div class="progress-bar" style="width: ${progress}%"></div>
      </div>
      <div class="project-card-footer">
        <span>${progress}% complété</span>
        ${project.dueDate ? `<span class="due-date">Échéance: ${project.dueDate}</span>` : ""}
      </div>
    </div>
  `;
}

function renderReview() {
  const inboxCount = state.tasks.filter(t => t.status === "inbox").length;
  const projectCount = state.projects.length;
  const doneCount = state.tasks.filter(t => t.status === "done").length;
  
  const updateText = (id, text) => {
    const el = document.querySelector(id);
    if (el) el.textContent = text;
  };

  updateText("#reviewInboxStats", `${inboxCount} tâches à trier`);
  updateText("#reviewProjectStats", `${projectCount} projets actifs`);
  updateText("#reviewWeekStats", `${doneCount} tâches terminées`);
}

// Dialogs
function openTaskDialog(taskId = "") {
  const task = taskId ? state.tasks.find(t => t.id === taskId) : null;
  const dialog = document.querySelector("#taskDialog");
  if (!dialog) return;

  document.querySelector("#editingTaskId").value = task?.id || "";
  document.querySelector("#taskDialogTitle").textContent = task ? "Modifier la tâche" : "Ajouter une tâche";
  document.querySelector("#quickTitle").value = task?.title || "";
  document.querySelector("#quickDescription").value = task?.description || "";
  document.querySelector("#quickPillar").value = task?.pillar || (state.deepWorkPillar === "all" ? pillars[0].id : state.deepWorkPillar);
  document.querySelector("#quickProject").value = task?.projectId || "";
  document.querySelector("#quickStatus").value = task?.status || "inbox";
  document.querySelector("#quickDueDate").value = task?.dueDate || "";

  dialog.showModal();
}

function closeTaskDialog() {
  const dialog = document.querySelector("#taskDialog");
  if (dialog) dialog.close();
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
  container.innerHTML = tasks.length ? tasks.map(taskCard).join("") : '<div class="empty-state">Aucune tâche pour ce projet.</div>';
}

// Utilitaires UI
function showToast(message, type = "info") {
  const container = document.querySelector("#toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

function switchView(viewName) {
  currentView = viewName;
  document.querySelectorAll(".tab-button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach(view => {
    view.classList.toggle("active", view.id === `${viewName}View`);
  });
  render();
}

function escapeHTML(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Événements
function initEventListeners() {
  const safeListen = (selector, event, handler) => {
    const el = document.querySelector(selector);
    if (el) el.addEventListener(event, handler);
  };

  safeListen("#quickAddForm", "submit", async (e) => {
    e.preventDefault();
    const id = document.querySelector("#editingTaskId").value;
    const title = document.querySelector("#quickTitle").value;
    const pillar = document.querySelector("#quickPillar").value;
    const projectId = document.querySelector("#quickProject").value;
    const status = document.querySelector("#quickStatus").value;
    const description = document.querySelector("#quickDescription").value;
    const dueDate = document.querySelector("#quickDueDate").value;

    if (id) {
      await updateTask(id, { title, pillar, projectId, status, description, dueDate });
    } else {
      await addTask(title, pillar, projectId);
    }
    closeTaskDialog();
  });

  safeListen("#openTaskDialog", "click", () => openTaskDialog());
  safeListen("#closeTaskDialog", "click", () => closeTaskDialog());

  safeListen("#contextSwitch", "change", (e) => {
    state.deepWorkPillar = e.target.value;
    persistAndRender();
  });

  safeListen("#pillarFilter", "change", (e) => {
    state.filters.pillar = e.target.value;
    render();
  });

  safeListen("#statusFilter", "change", (e) => {
    state.filters.status = e.target.value;
    render();
  });

  safeListen("#showArchivesToggle", "change", (e) => {
    state.showArchives = e.target.checked;
    render();
  });

  safeListen("#addProjectButton", "click", () => {
    document.querySelector("#projectDialog").showModal();
  });

  safeListen("#projectForm", "submit", async (e) => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    const name = document.querySelector("#projectNameInput").value;
    const pillar = document.querySelector("#projectPillarInput").value;
    const doneDefinition = document.querySelector("#projectDoneInput").value;
    const startDate = document.querySelector("#projectStartInput").value;
    const dueDate = document.querySelector("#projectDueInput").value;
    await addProject(name, pillar, doneDefinition, startDate, dueDate);
    document.querySelector("#projectDialog").close();
  });

  safeListen("#closeProjectDetail", "click", () => {
    document.querySelector("#projectDetailDialog").close();
  });

  safeListen("#archiveWeekButton", "click", () => archiveDoneTasks());
  safeListen("#resetFocusButton", "click", () => resetDailyFocus());

  document.querySelectorAll(".tab-button").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  document.body.addEventListener("click", (e) => {
    const actionBtn = e.target.closest("[data-action]");
    if (!actionBtn) return;
    const { action, id } = actionBtn.dataset;
    if (action === "toggle-status") {
      const t = state.tasks.find(tk => tk.id === id);
      if (t) setTaskStatus(id, t.status === "done" ? "planned" : "done");
    }
    if (action === "edit-task") openTaskDialog(id);
    if (action === "delete") deleteTask(id);
    if (action === "focus") setTaskStatus(id, "focus");
    if (action === "open-project") openProjectDetail(id);
  });

  document.querySelectorAll("dialog").forEach(dialog => {
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  });
}

function persistAndRender() {
  saveState();
  render();
}

async function init() {
  console.log("Initialisation de l'application...");
  initEventListeners();
  render(); // Rendu initial (local)
  
  state = await loadState(); // Chargement cloud
  render(); // Rendu final
}

init();
