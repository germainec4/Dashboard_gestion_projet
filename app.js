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

const roadmapBuckets = [
  { id: "now", label: "Maintenant" },
  { id: "week", label: "Cette semaine" },
  { id: "month", label: "Ce mois-ci" },
  { id: "later", label: "Plus tard" },
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

const addDaysISO = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const seedState = {
  deepWorkPillar: "all",
  filters: { pillar: "all", status: "all" },
  projects: [
    {
      id: "project_field_ops",
      name: "Essais terrain Q2",
      pillar: "engineer",
      doneDefinition: "La campagne est terminée quand les essais critiques sont documentés, les anomalies triées et le rapport partagé.",
      status: "active",
      createdAt: todayISO(),
      dueDate: addDaysISO(28),
    },
    {
      id: "project_portfolio",
      name: "Portfolio freelance",
      pillar: "design",
      doneDefinition: "Le portfolio est publié avec 3 cas clients, une offre claire et un formulaire testé.",
      status: "active",
      createdAt: todayISO(),
      dueDate: addDaysISO(14),
    },
    {
      id: "project_store",
      name: "Boutique première vente",
      pillar: "commerce",
      doneDefinition: "La boutique est vendable quand paiement, fiche produit, livraison et e-mails post-achat sont testés.",
      status: "active",
      createdAt: todayISO(),
      dueDate: addDaysISO(21),
    },
  ],
  tasks: [
    {
      id: "task_1",
      title: "Lister les anomalies ouvertes avant la prochaine sortie terrain",
      description: "Vérifier les points ouverts et isoler ce qui bloque la prochaine campagne.",
      pillar: "engineer",
      projectId: "project_field_ops",
      status: "focus",
      effort: "30 min",
      createdAt: todayISO(),
      dueDate: todayISO(),
    },
    {
      id: "task_2",
      title: "Rédiger la structure du cas client principal",
      description: "",
      pillar: "design",
      projectId: "project_portfolio",
      status: "planned",
      effort: "Deep Work",
      createdAt: todayISO(),
      dueDate: addDaysISO(3),
    },
    {
      id: "task_3",
      title: "Tester le paiement de bout en bout",
      description: "",
      pillar: "commerce",
      projectId: "project_store",
      status: "planned",
      effort: "30 min",
      createdAt: todayISO(),
      dueDate: addDaysISO(5),
    },
    {
      id: "task_4",
      title: "Idée : ajouter une page FAQ livraison",
      description: "",
      pillar: "commerce",
      projectId: "project_store",
      status: "inbox",
      effort: "5 min",
      createdAt: todayISO(),
      dueDate: "",
    },
  ],
  showArchives: false,
};

let state = loadState();
let selectedProjectId = null;

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return structuredClone(seedState);
  try {
    return { ...structuredClone(seedState), ...JSON.parse(stored) };
  } catch {
    return structuredClone(seedState);
  }
}

function openProjectDetail(projectId) {
  selectedProjectId = projectId;
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return;

  const pillar = pillarById(project.pillar);
  const progress = projectProgress(projectId);

  document.querySelector("#detailPillar").textContent = pillar.label;
  document.querySelector("#detailPillar").style.color = pillar.color;
  document.querySelector("#detailTitle").textContent = project.name;
  document.querySelector("#detailDoneDefinition").textContent = project.doneDefinition;
  document.querySelector("#detailProgressBar").style.width = `${progress}%`;
  document.querySelector("#detailProgressPercent").textContent = `${progress}%`;

  renderProjectTasks(projectId);
  document.querySelector("#projectDetailDialog").showModal();
}

function renderProjectTasks(projectId) {
  const container = document.querySelector("#projectTaskList");
  const projectTasks = state.tasks.filter((t) => t.projectId === projectId);

  if (projectTasks.length === 0) {
    container.innerHTML = `<p class="muted" style="text-align: center; padding: 20px;">Aucune tâche pour ce projet.</p>`;
    return;
  }

  container.innerHTML = projectTasks.map(taskCard).join("");
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showToast(message, type = "info") {
  const container = document.querySelector("#toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-20px)";
    toast.style.transition = "opacity 0.3s, transform 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function pillarById(id) {
  return pillars.find((pillar) => pillar.id === id) || pillars[pillars.length - 1];
}

function activeContextPillar() {
  return state.deepWorkPillar === "all" ? null : pillarById(state.deepWorkPillar);
}

function statusLabel(id) {
  return statuses.find((status) => status.id === id)?.label || id;
}

function projectById(id) {
  return state.projects.find((project) => project.id === id);
}

function isInDeepWorkContext(item) {
  return state.deepWorkPillar === "all" || item.pillar === state.deepWorkPillar;
}

function visibleTasks() {
  return state.tasks.filter((task) => {
    const deepMatch = isInDeepWorkContext(task);
    const pillarMatch = state.filters.pillar === "all" || task.pillar === state.filters.pillar;
    const statusMatch = state.filters.status === "all" || task.status === state.filters.status;
    return deepMatch && pillarMatch && statusMatch;
  });
}

function canFocus(taskId) {
  const focusTasks = state.tasks.filter((task) => task.status === "focus");
  const task = state.tasks.find((item) => item.id === taskId);
  return task?.status === "focus" || focusTasks.length < 3;
}

function setTaskStatus(taskId, nextStatus) {
  if (nextStatus === "focus" && !canFocus(taskId)) return;
  state.tasks = state.tasks.map((task) =>
    task.id === taskId ? { ...task, status: nextStatus } : task,
  );
  persistAndRender();
}

function deleteTask(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  
  if (confirm(`Supprimer la tache "${task.title}" ?`)) {
    state.tasks = state.tasks.filter((task) => task.id !== taskId);
    showToast("Tache supprimee", "info");
    persistAndRender();
  }
}

function addTask(title, pillar, projectId) {
  state.tasks.unshift({
    id: uid("task"),
    title,
    description: document.querySelector("#quickDescription").value.trim(),
    pillar,
    projectId,
    status: document.querySelector("#quickStatus").value || "inbox",
    effort: "30 min",
    createdAt: todayISO(),
    dueDate: document.querySelector("#quickDueDate").value,
  });
  showToast("Tache ajoutee", "success");
  persistAndRender();
}

function updateTask(taskId, updates) {
  state.tasks = state.tasks.map((task) =>
    task.id === taskId ? { ...task, ...updates } : task,
  );
  persistAndRender();
}
function saveProject(data) {
  const { id, name, pillar, doneDefinition, startDate, dueDate } = data;
  if (id) {
    const project = state.projects.find((p) => p.id === id);
    if (project) {
      project.name = name;
      project.pillar = pillar;
      project.doneDefinition = doneDefinition;
      project.startDate = startDate;
      project.dueDate = dueDate;
    }
    showToast("Projet mis à jour", "success");
  } else {
    state.projects.push({
      id: uid("project"),
      name,
      pillar,
      doneDefinition,
      startDate,
      dueDate,
      status: "active",
      createdAt: todayISO(),
    });
    showToast("Projet créé", "success");
  }
  persistAndRender();
  if (id && selectedProjectId === id) openProjectDetail(id);
}

function openProjectEditor(projectId) {
  const project = projectById(projectId);
  if (!project) return;

  document.querySelector("#editingProjectId").value = project.id;
  document.querySelector("#projectNameInput").value = project.name;
  document.querySelector("#projectPillarInput").value = project.pillar;
  document.querySelector("#projectDoneInput").value = project.doneDefinition || "";
  document.querySelector("#projectStartInput").value = project.startDate || project.createdAt || "";
  document.querySelector("#projectDueInput").value = project.dueDate || "";

  document.querySelector("#projectDialog h2").textContent = "Modifier le projet";
  document.querySelector("#projectDialog .button-primary").textContent = "Enregistrer";
  document.querySelector("#projectDialog").showModal();
}

function formatDeadline(dueDate) {
  if (!dueDate) return `<span class="deadline-badge none">Pas d'échéance</span>`;
  
  const due = new Date(`${dueDate}T12:00:00`);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  
  const diffTime = due - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  let statusClass = "normal";
  let label = `J-${diffDays}`;
  
  if (diffDays < 0) {
    statusClass = "overdue";
    label = `Retard (${Math.abs(diffDays)}j)`;
  } else if (diffDays <= 3) {
    statusClass = "urgent";
  } else if (diffDays <= 7) {
    statusClass = "warning";
  }
  
  return `<span class="deadline-badge ${statusClass}" title="${dueDate}">${label}</span>`;
}

function projectProgress(projectId) {
  const projectTasks = state.tasks.filter((task) => task.projectId === projectId);
  if (!projectTasks.length) return 0;
  const doneTasks = projectTasks.filter((task) => task.status === "done");
  return Math.round((doneTasks.length / projectTasks.length) * 100);
}

function roadmapBucketForProject(project) {
  if (!project.dueDate) return "later";

  const dueDate = new Date(`${project.dueDate}T12:00:00`);
  const now = new Date();
  const diffDays = Math.ceil((dueDate - now) / 86400000);

  if (diffDays <= 3) return "now";
  if (diffDays <= 7) return "week";
  if (diffDays <= 31) return "month";
  return "later";
}

function taskCard(task) {
  const pillar = pillarById(task.pillar);
  const project = projectById(task.projectId);

  return `
    <article class="task-card" 
             data-task-id="${task.id}" 
             tabindex="0" 
             draggable="true"
             aria-label="Modifier la tâche ${escapeHTML(task.title)}">
      <div class="task-main">
        <div>
          <p class="task-title">${escapeHTML(task.title)}</p>
          ${task.description ? `<p class="task-description">${escapeHTML(task.description)}</p>` : ""}
          <div class="meta-row">
            <span class="pill" style="--pillar-color: ${pillar.color}">
              <span class="pillar-dot"></span>${pillar.label}
            </span>
            <span>${project ? escapeHTML(project.name) : "Sans projet"}</span>
            <span class="pill">${statusLabel(task.status)}</span>
            ${task.dueDate ? `<span>${task.dueDate}</span>` : ""}
          </div>
        </div>
        <div class="task-actions">${taskActions(task)}</div>
      </div>
    </article>
  `;
}

function taskActions(task) {
  const actions = [];
  const focusDisabled = !canFocus(task.id);

  if (task.status !== "focus" && task.status !== "done") {
    actions.push(`
      <button class="action-button" title="Mettre dans les 3 priorités du jour" aria-label="Mettre en priorité jour" data-action="focus" data-id="${task.id}" ${focusDisabled ? "disabled" : ""}>
        ${ICONS.focus}<span>Prioriser</span>
      </button>
    `);
  }

  if (task.status !== "planned" && task.status !== "done") {
    actions.push(`
      <button class="action-button" title="Planifier pour plus tard" aria-label="Planifier" data-action="planned" data-id="${task.id}">
        ${ICONS.plan}<span>Planifier</span>
      </button>
    `);
  }

  if (task.status !== "done") {
    actions.push(`
      <button class="action-button action-done" title="Marquer comme terminé" aria-label="Marquer comme terminé" data-action="done" data-id="${task.id}">
        ${ICONS.check}
      </button>
    `);
  }

  if (task.status === "done") {
    actions.push(`
      <button class="action-button" title="Remettre dans les tâches planifiées" aria-label="Réouvrir" data-action="planned" data-id="${task.id}">
        ${ICONS.reopen}<span>Réouvrir</span>
      </button>
    `);
  }

  actions.push(`
    <button class="action-button action-danger" title="Supprimer la tâche" aria-label="Supprimer" data-action="delete" data-id="${task.id}">
      ${ICONS.trash}
    </button>
  `);

  return actions.join("");
}

function renderSelectOptions() {
  const quickPillarCurrent = document.querySelector("#quickPillar")?.value;
  const quickStatusCurrent = document.querySelector("#quickStatus")?.value;
  const pillarOptions = pillars
    .map((pillar) => `<option value="${pillar.id}">${pillar.label}</option>`)
    .join("");
  const statusOptions = statuses
    .map((status) => `<option value="${status.id}">${status.label}</option>`)
    .join("");
  const contextOptions = `<option value="all">Tous les piliers</option>${pillarOptions}`;
  const filterOptions = `<option value="all">Tous</option>${pillarOptions}`;
  const projectOptions = state.projects
    .map((project) => `<option value="${project.id}">${escapeHTML(project.name)}</option>`)
    .join("");

  document.querySelector("#quickPillar").innerHTML = pillarOptions;
  document.querySelector("#projectPillarInput").innerHTML = pillarOptions;
  document.querySelector("#contextSwitch").innerHTML = contextOptions;
  document.querySelector("#pillarFilter").innerHTML = filterOptions;
  document.querySelector("#quickProject").innerHTML =
    `<option value="">Sans projet</option>${projectOptions}`;
  document.querySelector("#quickStatus").innerHTML = statusOptions;

  document.querySelector("#quickPillar").value =
    state.deepWorkPillar === "all" ? quickPillarCurrent || pillars[0].id : state.deepWorkPillar;
  document.querySelector("#quickStatus").value = quickStatusCurrent || "inbox";
  document.querySelector("#contextSwitch").value = state.deepWorkPillar;
  document.querySelector("#pillarFilter").value = state.filters.pillar;
  document.querySelector("#statusFilter").value = state.filters.status;
  document.querySelector("#showArchivesToggle").checked = !!state.showArchives;
}

function renderMetrics() {
  const contextTasks = state.tasks.filter(isInDeepWorkContext);
  const focusTasks = contextTasks.filter((task) => task.status === "focus");

  document.querySelector("#focusCount").textContent = `${focusTasks.length}/3`;
  document.querySelector("#focusWarning").classList.toggle("hidden", focusTasks.length <= 3);
}

function renderTaskSections() {
  const contextTasks = state.tasks.filter(isInDeepWorkContext);
  const focusTasks = contextTasks.filter((task) => task.status === "focus");
  const inboxTasks = contextTasks.filter((task) => task.status === "inbox");
  const operationalTasks = visibleTasks();

  renderList("#focusList", focusTasks, "Aucune priorité. Choisis une prochaine action claire.");
  renderList("#inboxList", inboxTasks, "Inbox vide. Le système respire.");
  renderWorkPlan(operationalTasks);
  initDragAndDrop();
}

function renderList(selector, tasks, emptyText) {
  document.querySelector(selector).innerHTML = tasks.length
    ? tasks.map(taskCard).join("")
    : `<div class="empty-state">${emptyText}</div>`;
}

function renderWorkPlan(tasks) {
  if (!tasks.length) {
    document.querySelector("#workPlan").innerHTML = `<div class="empty-state">Aucune tache pour ce filtre.</div>`;
    return;
  }

  const focusTasks = tasks.filter((task) => task.status === "focus");
  const body = [
    workPlanLane({
      id: "focus",
      title: "Priorites du jour",
      hint: "Maximum 3. C'est la zone de decision, pas un backlog.",
      tasks: focusTasks,
      featured: true,
    }),
    ...workPlanGroups.map((group) =>
      workPlanLane({
        ...group,
        tasks: tasks.filter((task) => task.status === group.id),
      }),
    ),
  ].join("");

  const workPlan = document.querySelector("#workPlan");
  workPlan.innerHTML = body;
  workPlan.classList.toggle("focus-mode", !state.showArchives);
}

function workPlanLane(group) {
  return `
    <section class="work-lane ${group.featured ? "work-lane-featured" : ""}" data-lane-id="${group.id}">
      <div class="work-lane-header">
        <div>
          <h3>${group.title}</h3>
          <p>${group.hint}</p>
        </div>
        <span>${group.tasks.length}</span>
      </div>
      <div class="work-lane-body">
        ${
          group.tasks.length
            ? group.tasks.map(taskCard).join("")
            : `<div class="empty-state">Rien ici.</div>`
        }
      </div>
    </section>
  `;
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

function renderProjects() {
  const contextProjects = state.projects.filter(isInDeepWorkContext);
  document.querySelector("#projectList").innerHTML = contextProjects.length
    ? contextProjects.map(projectCard).join("")
    : `<div class="empty-state">Aucun projet actif.</div>`;
    
  renderGantt();
}

function renderGantt() {
  const container = document.querySelector("#ganttTimeline");
  if (!container) return;

  // Utilisation du même filtre que pour la liste des projets
  const projects = state.projects.filter(p => p.status === "active" && isInDeepWorkContext(p));
  
  if (!projects.length) {
    container.innerHTML = `<div class="empty-state">Aucun projet actif dans ce contexte pour le Gantt.</div>`;
    return;
  }

  // Calcul de la plage temporelle
  const now = new Date();
  now.setHours(12, 0, 0, 0);

  // Bornes par défaut
  let startRange = new Date(now.getTime() - 14 * 86400000);
  let endRange = new Date(now.getTime() + 45 * 86400000);

  // Ajuster les bornes en fonction des projets
  projects.forEach(p => {
    const pStart = new Date(`${p.startDate || p.createdAt}T12:00:00`);
    if (pStart < startRange) startRange = new Date(pStart.getTime() - 7 * 86400000);
    
    if (p.dueDate) {
      const pEnd = new Date(`${p.dueDate}T12:00:00`);
      if (pEnd > endRange) endRange = new Date(pEnd.getTime() + 14 * 86400000);
    }
  });

  const totalDays = Math.ceil((endRange - startRange) / 86400000);
  // On définit une largeur de base : 25px par jour pour garder une bonne lisibilité
  const timelineWidth = Math.max(1200, totalDays * 25);
  container.style.minWidth = `${timelineWidth}px`;

  // Header avec les mois
  const months = [];
  let curr = new Date(startRange);
  while (curr <= endRange) {
    const m = curr.toLocaleString("default", { month: "long" });
    if (!months.includes(m)) months.push(m);
    curr.setDate(curr.getDate() + 15);
  }

  let html = `
    <div class="gantt-grid-header">
      <div></div>
      <div class="gantt-months">
        ${months.map(m => `<span>${m}</span>`).join("")}
      </div>
    </div>
  `;

  // Marqueur Aujourd'hui
  const todayPos = ((now - startRange) / (endRange - startRange)) * 100;
  html += `<div class="gantt-today-marker" style="left: calc(var(--gantt-label-width) + var(--gantt-gap) + (100% - var(--gantt-label-width) - var(--gantt-gap)) * ${todayPos / 100})"></div>`;

  // Lignes de projet
  projects.forEach(project => {
    const pillar = pillarById(project.pillar);
    const start = new Date(`${project.startDate || project.createdAt}T12:00:00`);
    const due = project.dueDate ? new Date(`${project.dueDate}T12:00:00`) : new Date(now.getTime() + 86400000);
    
    // Calcul position et largeur en %
    let startPos = ((start - startRange) / (endRange - startRange)) * 100;
    let endPos = ((due - startRange) / (endRange - startRange)) * 100;
    
    // Clipping
    startPos = Math.max(0, Math.min(100, startPos));
    endPos = Math.max(0, Math.min(100, endPos));
    const width = Math.max(2, endPos - startPos);

    html += `
      <div class="gantt-row">
        <div class="gantt-project-name" title="${escapeHTML(project.name)}">${escapeHTML(project.name)}</div>
        <div class="gantt-track">
          <div class="gantt-bar" 
               onclick="openProjectDetail('${project.id}')"
               style="left: ${startPos}%; width: ${width}%; background: ${pillar.color};"
               title="${project.name} (${project.createdAt} -> ${project.dueDate || "?"})">
            ${width > 10 ? escapeHTML(project.name) : ""}
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function projectCard(project) {
  const pillar = pillarById(project.pillar);
  const progress = projectProgress(project.id);
  const taskCount = state.tasks.filter((task) => task.projectId === project.id).length;
  const nextAction = state.tasks.find(
    (task) => task.projectId === project.id && task.status !== "done",
  );

  return `
    <article class="project-card" onclick="openProjectDetail('${project.id}')" style="cursor: pointer;">
      <div class="project-top">
        <div>
          <h3>${escapeHTML(project.name)}</h3>
          <div class="meta-row">
            <span class="pill" style="--pillar-color: ${pillar.color}">
              <span class="pillar-dot"></span>${pillar.label}
            </span>
            <span>${taskCount} tâches</span>
          </div>
        </div>
        ${formatDeadline(project.dueDate)}
      </div>
      <p class="muted" style="font-size: 13px; margin: 12px 0;">${escapeHTML(project.doneDefinition || "Définition du \"done\" à clarifier.")}</p>
      <div class="meta-row" style="margin-top: 8px">
        <span class="muted">Prochaine action :</span>
        <strong style="font-size: 13px;">${nextAction ? escapeHTML(nextAction.title) : "À définir"}</strong>
      </div>
    </article>
  `;
}

function renderReview() {
  const inboxTasks = state.tasks.filter(t => t.status === "inbox");
  const projectsWithoutAction = state.projects.filter(p => {
    const hasNextAction = state.tasks.some(t => t.projectId === p.id && t.status !== "done");
    return !hasNextAction && p.status === "active";
  });
  const doneThisWeek = state.tasks.filter(t => t.status === "done").length;

  document.querySelector("#reviewInboxStats").innerHTML = inboxTasks.length > 0 
    ? `Il te reste <strong>${inboxTasks.length}</strong> élément(s) à trier dans ton Inbox.`
    : `Ton Inbox est <strong>propre</strong>. Bien joué !`;

  document.querySelector("#reviewProjectStats").innerHTML = projectsWithoutAction.length > 0
    ? `Attention, <strong>${projectsWithoutAction.length}</strong> projet(s) n'ont pas de prochaine action définie.`
    : `Tous tes projets sont <strong>actifs</strong> et clairs.`;

  document.querySelector("#reviewWeekStats").innerHTML = `Tu as accompli <strong>${doneThisWeek}</strong> tâche(s) cette semaine. Prêt pour la suivante ?`;
}

function archiveFinishedTasks() {
  const doneCount = state.tasks.filter(t => t.status === "done").length;
  if (doneCount === 0) {
    showToast("Aucune tâche à archiver", "info");
    return;
  }

  if (confirm(`Voulez-vous archiver (supprimer) les ${doneCount} tâches terminées ?`)) {
    state.tasks = state.tasks.filter(t => t.status !== "done");
    persistAndRender();
    showToast(`${doneCount} tâches archivées`, "success");
  }
}

function switchView(viewName) {
  currentView = viewName;
  
  // Mise à jour des boutons d'onglets
  document.querySelectorAll(".tab-button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  // Mise à jour des sections de vue
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("active", v.id === `${viewName}View`);
  });

  render();
}

function render() {
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
}

function renderContextAccent() {
  const contextPillar = activeContextPillar();
  document.body.dataset.context = contextPillar?.id || "all";
  document.body.style.setProperty("--context-accent", contextPillar?.color || "#ededed");
  document.body.style.setProperty("--context-accent-soft", contextPillar ? `${contextPillar.color}24` : "rgba(255, 255, 255, 0.08)");
  document.body.style.setProperty("--context-accent-border", contextPillar ? `${contextPillar.color}88` : "#2a2a2a");
}

function openTaskDialog(taskId = "") {
  const task = taskId ? state.tasks.find((item) => item.id === taskId) : null;
  const dialog = document.querySelector("#taskDialog");

  document.querySelector("#editingTaskId").value = task?.id || "";
  document.querySelector("#taskDialogKicker").textContent = task ? "Edition" : "Capture rapide";
  document.querySelector("#taskDialogTitle").textContent = task ? "Modifier la tache" : "Ajouter une tache";
  document.querySelector("#taskDialogSubmit").textContent = task ? "Enregistrer les changements" : "Ajouter a l'inbox";
  document.querySelector("#quickTitle").value = task?.title || "";
  document.querySelector("#quickDescription").value = task?.description || "";
  document.querySelector("#quickPillar").value =
    task?.pillar || (state.deepWorkPillar === "all" ? pillars[0].id : state.deepWorkPillar);
  document.querySelector("#quickProject").value = task?.projectId || "";
  document.querySelector("#quickStatus").value = task?.status || "inbox";
  document.querySelector("#quickDueDate").value = task?.dueDate || "";

  dialog.showModal();
  document.querySelector("#quickTitle").focus();
}

function closeTaskDialog() {
  document.querySelector("#taskDialog").close();
  document.querySelector("#openTaskDialog").focus();
}

function toggleTaskStatus(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  const nextStatus = task.status === "done" ? "planned" : "done";
  setTaskStatus(taskId, nextStatus);
  showToast(nextStatus === "done" ? "Tâche terminée !" : "Tâche réouverte", "success");
}

function persistAndRender() {
  saveState();
  render();
  
  if (selectedProjectId) {
    renderProjectTasks(selectedProjectId);
    const progress = projectProgress(selectedProjectId);
    document.querySelector("#detailProgressBar").style.width = `${progress}%`;
    document.querySelector("#detailProgressPercent").textContent = `${progress}%`;
  }
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initEventListeners() {
  document.querySelector("#quickAddForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const editingTaskId = document.querySelector("#editingTaskId").value;
    const titleInput = document.querySelector("#quickTitle");
    const title = titleInput.value.trim();
    
    if (!title) {
      titleInput.classList.add("shake");
      titleInput.focus();
      setTimeout(() => titleInput.classList.remove("shake"), 400);
      showToast("Le titre est requis", "error");
      return;
    }

    const projectId = document.querySelector("#quickProject").value;
    const project = projectById(projectId);
    const pillar = project?.pillar || document.querySelector("#quickPillar").value;

    if (editingTaskId) {
      updateTask(editingTaskId, {
        title,
        description: document.querySelector("#quickDescription").value.trim(),
        pillar,
        projectId,
        status: document.querySelector("#quickStatus").value,
        dueDate: document.querySelector("#quickDueDate").value,
      });
      showToast("Tâche mise à jour", "success");
    } else {
      addTask(title, pillar, projectId);
    }

    document.querySelector("#quickAddForm").reset();
    closeTaskDialog();
  });

  document.querySelector("#quickProject").addEventListener("change", (event) => {
    const project = projectById(event.target.value);
    if (project) document.querySelector("#quickPillar").value = project.pillar;
  });

  document.querySelector("#quickPillar").addEventListener("change", () => {
    document.querySelector("#quickProject").value = "";
  });

  document.querySelector("#openTaskDialog").addEventListener("click", () => {
    openTaskDialog();
  });

  document.querySelector("#closeTaskDialog").addEventListener("click", () => {
    closeTaskDialog();
  });

  document.querySelector("#contextSwitch").addEventListener("change", (event) => {
    state.deepWorkPillar = event.target.value;
    state.filters.pillar = "all";
    persistAndRender();
  });

  document.querySelector("#pillarFilter").addEventListener("change", (event) => {
    state.filters.pillar = event.target.value;
    persistAndRender();
  });

  document.querySelector("#statusFilter").addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    persistAndRender();
  });

  document.querySelector("#resetFocusButton").addEventListener("click", () => {
    state.tasks = state.tasks.map((task) =>
      task.status === "focus" ? { ...task, status: "planned" } : task,
    );
    persistAndRender();
  });

  document.querySelector("#addProjectButton").addEventListener("click", () => {
    document.querySelector("#editingProjectId").value = "";
    document.querySelector("#projectForm").reset();
    document.querySelector("#projectStartInput").value = todayISO();
    document.querySelector("#projectDialog h2").textContent = "Nouveau projet";
    document.querySelector("#projectDialog .button-primary").textContent = "Créer";
    document.querySelector("#projectDialog").showModal();
  });

  document.querySelector("#editProjectButton").addEventListener("click", () => {
    if (selectedProjectId) openProjectEditor(selectedProjectId);
  });

  document.querySelector("#projectForm").addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    saveProject({
      id: document.querySelector("#editingProjectId").value,
      name: document.querySelector("#projectNameInput").value,
      pillar: document.querySelector("#projectPillarInput").value,
      doneDefinition: document.querySelector("#projectDoneInput").value,
      startDate: document.querySelector("#projectStartInput").value,
      dueDate: document.querySelector("#projectDueInput").value,
    });
    document.querySelector("#projectDialog").close();
  });

  document.querySelector("#exportButton").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `multi-focus-engine-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  document.querySelector("#importInput").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try {
      const text = await file.text();
      state = { ...structuredClone(seedState), ...JSON.parse(text) };
      persistAndRender();
      showToast("Importation réussie", "success");
    } catch {
      showToast("Erreur lors de l'importation", "error");
    }
  });

  document.querySelectorAll(".tab-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchView(btn.dataset.view);
    });
  });

  document.querySelector("#closeProjectDetail").onclick = () => {
    document.querySelector("#projectDetailDialog").close();
    selectedProjectId = null;
  };

  document.querySelector("#addTaskToProject").onclick = () => {
    openTaskDialog();
    document.querySelector("#quickProject").value = selectedProjectId;
  };

  // Fermer les pop-ups en cliquant à l'extérieur
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        dialog.close();
        if (dialog.id === "projectDetailDialog") selectedProjectId = null;
      }
    });
  });

  document.querySelector("#showArchivesToggle").addEventListener("change", (event) => {
    state.showArchives = event.target.checked;
    persistAndRender();
  });

  document.querySelector("#archiveWeekButton").addEventListener("click", () => {
    archiveFinishedTasks();
  });

  // Gestion globale des clics (Actions de tâches et ouverture de détails)
  document.body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (button) {
      const { action, id } = button.dataset;
      event.stopPropagation(); // Empêcher l'ouverture du détail du projet si clic sur action de tâche
      if (["focus", "planned", "done"].includes(action)) setTaskStatus(id, action);
      if (action === "delete") deleteTask(id);
      return;
    }
  });

  // Raccourcis clavier
  document.addEventListener("keydown", (event) => {
    const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
    if (isTyping) return;

    if (event.key.toLowerCase() === "n") {
      openTaskDialog();
    }
    // Raccourcis piliers
    const pillarKeys = { "1": "engineer", "2": "design", "3": "commerce", "0": "all" };
    if (pillarKeys[event.key]) {
      state.deepWorkPillar = pillarKeys[event.key];
      persistAndRender();
    }
  });
}

// Initialisation
initEventListeners();
render();
