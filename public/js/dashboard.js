"use strict";
const $ = (id) => document.getElementById(id);
const token =
  localStorage.getItem("devmatrix_token") ||
  localStorage.getItem("appforge_token");
let projects = [],
  current,
  selectedStep = 1,
  activeView = "overview",
  template,
  toastTimer,
  currentUser;
const stacks = {
  node: "Node.js · Express",
  java: "Java · Spring Boot",
  python: "Python · FastAPI",
};
const databases = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  none: "Stateless / no database",
};
const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").className = "toast" + (error ? " error" : "");
  $("toast").hidden = false;
  toastTimer = setTimeout(() => ($("toast").hidden = true), 6500);
}
function showError(id, message) {
  $(id).textContent = message;
  $(id).hidden = !message;
}
function logout() {
  for (const key of [
    "devmatrix_token",
    "devmatrix_user",
    "appforge_token",
    "appforge_user",
  ])
    localStorage.removeItem(key);
  location.href = "/auth";
}
async function api(path, options = {}) {
  const response = await fetch("/api" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...options.headers,
    },
  });
  const data = await response.json();
  if (response.status === 401) {
    logout();
    throw new Error("Please sign in again.");
  }
  if (!response.ok)
    throw new Error(data.error || "Request failed. Please try again.");
  return data;
}
function changeView(view) {
  activeView = view;
  document.body.classList.toggle("is-overview", view === "overview");
  if (current) {
    $("pageTitle").textContent = view === "overview" ? "Deployment intelligence & planning" : current.name;
    $("pageDescription").textContent = view === "overview" ? "Your applications, requirements and next steps — in one workspace." : "Plan deployment in your own cloud, from requirements to domain mapping.";
  }
  document
    .querySelectorAll(".view")
    .forEach((e) => (e.hidden = e.id !== "view-" + view));
  document.querySelectorAll("[data-view]").forEach((e) => {
    e.classList.toggle("active", e.dataset.view === view);
    e.setAttribute("aria-current", e.dataset.view === view ? "page" : "false");
  });
  if (view === "resources" && current) loadTemplate();
  window.workspaceOperations?.open(current, view);
}
function selectProject(id) {
  current = projects.find((p) => p._id === id) || projects[0];
  if (current) selectedStep = current.readiness.nextStep || 8;
  render();
}
function updateProject(project) {
  const i = projects.findIndex((p) => p._id === project._id);
  if (i >= 0) projects[i] = project;
  else projects.push(project);
  current = project;
  template = null;
  render();
}
function render() {
  $("loading").hidden = true;
  $("emptyState").hidden = Boolean(current);
  $("projectContent").hidden = !current;
  $("projectSelect").innerHTML =
    projects
      .map(
        (p) =>
          `<option value="${escapeHTML(p._id)}">${escapeHTML(p.name)}</option>`,
      )
      .join("") || "<option>No applications</option>";
  if (!current) {
    $("pageTitle").textContent =
      `Welcome, ${currentUser?.firstName || "there"}.`;
    $("pageDescription").textContent =
      "Create your first application when you’re ready.";
    $("breadcrumbProject").textContent = "Applications";
    window.workspaceOperations?.open(null, activeView);
    window.githubConnection?.load(null);
    return;
  }
  $("projectSelect").value = current._id;
  $("pageTitle").textContent = current.name;
  $("breadcrumbProject").textContent = current.name;
  $("pageDescription").textContent =
    "Plan deployment in your own cloud, from requirements to domain mapping.";
  const completed = current.readiness.checks.filter(c => c.passed).length;
  $("progressValue").textContent = completed + " / " + current.readiness.checks.length;
  $("progressFill").style.width = (completed / current.readiness.checks.length) * 100 + "%";
  $("progressBar").setAttribute("aria-valuenow", completed);
  $("progressBar").setAttribute("aria-valuemax", current.readiness.checks.length);
  const next = {name: "Review deployment approach", step: 1, category: "Plan in your own cloud"};
  $("nextAction").textContent = !current.readiness.ready
    ? "Complete your brief"
    : next
      ? next.name
      : "Cycle recorded";
  $("nextActionHint").textContent = !current.readiness.ready
    ? "Resolve the missing brief fields"
    : next
      ? "Stage " + next.step + " · " + next.category
      : "Review production monitoring and support";
  $("stackValue").textContent = stacks[current.stack] || "Choose a runtime";
  $("databaseValue").textContent =
    databases[current.database] || "Choose a database";
  $("briefStatus").textContent = current.readiness.ready
    ? "Requirements recorded"
    : "Draft brief";
  $("briefStatus").className =
    "pill" + (current.readiness.ready ? " green" : "");
  const b = current.brief || {};
  for (const [id, value] of Object.entries({
    briefName: current.name,
    briefOwner: b.owner,
    briefGoal: b.goal,
    briefAudience: b.audience,
    briefRepository: b.repositoryUrl,
    briefAcceptance: b.acceptanceCriteria,
    briefNotes: b.notes,
    briefCloud: b.cloud,
    briefRegion: b.region,
    briefDomain: b.domain,
    briefRequirements: b.requirements,
  }))
    $(id).value = value || "";
  $("briefStack").value = current.stack || "node";
  $("briefDatabase").value = current.database || "postgres";
  $("readinessChecks").innerHTML = current.readiness.checks
    .map(
      (c) =>
        `<span class="pill ${c.passed ? "green" : ""}" title="${escapeHTML(c.passed ? "Complete" : c.action)}">${c.passed ? "✓" : "○"} ${escapeHTML(c.name)}</span>`,
    )
    .join("");
  renderOverview();
  renderPlan();
  renderStages();
  renderActivity();
  window.githubConnection?.load(current);
  changeView(activeView);
}
function renderOverview() {
  const data = projects.map(p => ({ project: p, passed: p.readiness.checks.filter(c => c.passed).length, total: p.readiness.checks.length }));
  const shown = data.slice(0, 8);
  const coords = shown.map((d, i) => [shown.length === 1 ? 300 : 35 + i * 530 / (shown.length - 1), 165 - (d.passed / d.total) * 130]);
  const line = coords.map(p => p.join(',')).join(' ');
  const area = coords.length ? `M ${coords[0][0]} 175 L ${coords.map(p => p.join(' ')).join(' L ')} L ${coords[coords.length - 1][0]} 175 Z` : '';
  $("coverageChart").innerHTML = `<svg viewBox="0 0 600 205" role="img" aria-label="Saved requirement percentages for ${shown.length} applications"><defs><linearGradient id="coverageFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#6b5638" stop-opacity=".25"/><stop offset="1" stop-color="#6b5638" stop-opacity="0"/></linearGradient></defs>${[35,100,165].map((y,i)=>`<line x1="25" y1="${y}" x2="575" y2="${y}" stroke="#72594020" stroke-dasharray="3 6"/><text x="4" y="${y+4}" class="chart-axis">${100-i*50}%</text>`).join('')}<path d="${area}" fill="url(#coverageFill)"/><polyline points="${line}" fill="none" stroke="#5d492f" stroke-width="2.5" stroke-linejoin="round"/>${coords.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="4" fill="#eee6a0" stroke="#66502f" stroke-width="2"><title>${escapeHTML(shown[i].project.name)}: ${Math.round(shown[i].passed/shown[i].total*100)}%</title></circle><text x="${x}" y="197" text-anchor="middle" class="chart-axis">App ${i+1}</text>`).join('')}</svg><div class="chart-caption">${shown.map((d,i)=>`<span>${i+1}. ${escapeHTML(d.project.name)} · ${Math.round(d.passed/d.total*100)}%</span>`).join('')}</div>${data.length>8?'<small>Showing the first 8 applications. All apps appear below.</small>':''}`;
  const checks = current.readiness.checks, complete = checks.filter(c => c.passed).length, missing = checks.length - complete;
  $("overviewSelectedName").textContent = current.name;
  $("requirementsRing").innerHTML = `<div class="donut" role="img" aria-label="${complete} of ${checks.length} requirements captured"><div><small>Captured</small><strong>${complete}<span>/${checks.length}</span></strong></div></div><div class="ring-legend"><p><i class="legend-dot filled"></i>Captured<strong>${complete}</strong></p><p><i class="legend-dot"></i>Still needed<strong>${missing}</strong></p><small>These are brief fields, not verified resources.</small><button class="button secondary" type="button" data-open-brief="${escapeHTML(current._id)}">Complete requirements ↗</button></div>`;
  $("requirementsRing").querySelector(".donut").style.setProperty("--coverage", `${complete/checks.length*100}%`);
  $("appCount").textContent = `${projects.length} application${projects.length===1?'':'s'}`;
  $("applicationCards").innerHTML = data.map(({project:p,passed,total},i)=>{
    const recorded=p.pipelineStages.filter(s=>s.evidence).length;
    const next=p.readiness.checks.find(c=>!c.passed);
    const cloud=p.deploymentPlan?.cloud||'Cloud not selected';
    return `<article class="panel app-card"><div class="app-card-head"><span class="app-avatar">${escapeHTML(p.name.slice(0,2).toUpperCase())}</span><div><h3>${escapeHTML(p.name)}</h3><small>${escapeHTML(stacks[p.stack]||p.stack)}</small></div><span class="pill">${recorded}/8 evidence</span></div><span class="app-cloud">${escapeHTML(cloud)}</span><p class="app-next">${escapeHTML(next?next.action:'Requirements captured. Review your cloud-specific deployment approach.')}</p><div class="app-card-progress"><span>Requirements captured</span><strong>${passed}/${total}</strong></div><div class="progress"><span ></span></div><div class="app-card-footer"><small>${escapeHTML(databases[p.database]||p.database)}</small><button type="button" class="button" data-open-brief="${escapeHTML(p._id)}">Open app ↗</button></div></article>`;
  }).join('');
  $("applicationCards").querySelectorAll(".progress span").forEach((bar,i) => { bar.style.width = `${data[i].passed/data[i].total*100}%`; });
}
$("view-overview").addEventListener("click", event => {
  const button = event.target.closest("[data-open-brief]");
  if (!button) return;
  activeView = "brief";
  selectProject(button.dataset.openBrief);
});
function renderPlan() {
  const plan = current.deploymentPlan;
  if (!plan) return;
  $("guidancePlan").innerHTML = `<div class="notice"><strong>${escapeHTML(plan.cloud || 'Choose your cloud in App requirements')}${plan.target ? ' · ' + escapeHTML(plan.target) : ''}</strong><p>${escapeHTML(plan.status)}</p><p>Region: ${escapeHTML(plan.requirements.region)}</p><p>Requirements: ${escapeHTML(plan.requirements.constraints)}</p><p>Constraints & decisions: ${escapeHTML(plan.requirements.notes)}</p><p>CloudOps provides the approach and review checklist. You inspect resources, run commands and apply fixes in your own tools. Never share cloud credentials or secret values.</p></div>` + plan.steps.map((step, i) => `<article class="panel section-pad"><div class="panel-head"><h2>${i + 1}. ${escapeHTML(step.title)}</h2><span class="pill">Not verified</span></div><div class="panel-body"><ul class="checklist">${step.actions.map(action => `<li>${escapeHTML(action)}</li>`).join('')}</ul></div></article>`).join('');
}
function renderStages() {
  $("stageList").innerHTML = current.pipelineStages
    .map(
      (s) =>
        `<button type="button" class="stage-button ${s.status === "completed" ? "done" : ""} ${s.step === selectedStep ? "active" : ""}" data-step="${s.step}" aria-current="${s.step === selectedStep ? "step" : "false"}"><span class="stage-number">${s.status === "completed" ? "✓" : String(s.step).padStart(2, "0")}</span><span><strong>${escapeHTML(s.name)}</strong><small>${s.status === "completed" ? "Evidence recorded" : s.step === current.readiness.nextStep ? "Next gate" : "Upcoming"}</small></span></button>`,
    )
    .join("");
  $("stageList")
    .querySelectorAll("button")
    .forEach((button) =>
      button.addEventListener("click", () => {
        selectedStep = Number(button.dataset.step);
        renderStages();
      }),
    );
  const s = current.pipelineStages.find((stage) => stage.step === selectedStep);
  const locked =
    !current.readiness.ready ||
    current.pipelineStages
      .slice(0, s.step - 1)
      .some((stage) => stage.status !== "completed");
  const evidence = s.evidence;
  $("stageDetail").innerHTML =
    `<div class="panel-head"><span class="mono text-muted">GATE ${String(s.step).padStart(2, "0")} / 08</span><span class="pill ${evidence ? "green" : ""}">${evidence ? "Owner evidence recorded" : locked ? "Waiting for prerequisites" : "Ready to work"}</span></div><div class="panel-body"><small>${escapeHTML(s.category)}</small><h2 class="gate-title">${escapeHTML(s.name)}</h2><p>${escapeHTML(s.description)}</p><ul class="checklist">${s.checklist.map((c) => `<li>${escapeHTML(c)}</li>`).join("")}</ul><div class="deliverable"><small>What to deliver</small>${escapeHTML(s.deliverable)}</div>${evidence ? `<div class="evidence-record"><span class="pill green">Owner attestation · ${escapeHTML(new Date(evidence.recordedAt).toLocaleDateString())}</span><p>${escapeHTML(evidence.summary)}</p><a href="${escapeHTML(evidence.url)}" target="_blank" rel="noopener noreferrer">Open evidence ↗</a><br><small>Recorded by the project owner. External execution has not been independently verified.</small></div>` : locked ? `<div class="notice">${!current.readiness.ready ? "Save a complete brief and review readiness before recording evidence." : "Record evidence for the earlier gates before completing this stage."}</div><button class="button secondary" id="backToBriefBtn">${!current.readiness.ready ? "Open project brief ↗" : "Open next gate ↗"}</button>` : `<form class="evidence-form" id="evidenceForm"><label>Outcome & review notes<textarea name="summary" minlength="20" maxlength="4000" required placeholder="Explain what you did, what passed or failed, and any remaining risks."></textarea></label><label>Evidence link<input name="url" type="url" placeholder="https://github.com/your-team/your-app/actions/runs/…" maxlength="2000" required><small>Link a report, approved document, or release record. Do not include credentials.</small></label><label class="checkbox"><input type="checkbox" name="acknowledged" required><span>I reviewed this evidence and confirm it supports this gate. I understand this records my review and does not trigger or verify an external build or deployment.</span></label><p class="error-text" id="evidenceError" role="alert" hidden></p><button class="button" type="submit">Record evidence & continue →</button></form>`}</div>`;
  $("backToBriefBtn")?.addEventListener("click", () => {
    if (!current.readiness.ready) changeView("brief");
    else {
      selectedStep = current.readiness.nextStep;
      renderStages();
    }
  });
  $("evidenceForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      const form = new FormData(event.target);
      const data = await api(`/projects/${current._id}/step/${selectedStep}`, {
        method: "PUT",
        body: JSON.stringify({
          summary: form.get("summary"),
          url: form.get("url"),
          acknowledged: form.get("acknowledged") === "on",
        }),
      });
      selectedStep = data.project.readiness.nextStep || 8;
      updateProject(data.project);
      toast("Evidence recorded. Your delivery plan is up to date.");
    } catch (e) {
      showError("evidenceError", e.message);
      button.disabled = false;
    }
  });
}
function renderActivity() {
  const stages = current.pipelineStages.filter((s) => s.evidence).reverse();
  $("activityList").innerHTML = stages.length
    ? stages
        .map(
          (s) =>
            `<article class="activity-item"><span class="pill green">Stage ${s.step} · Owner attestation</span><h3 class="section-pad">${escapeHTML(s.name)}</h3><p>${escapeHTML(s.evidence.summary)}</p><a href="${escapeHTML(s.evidence.url)}" target="_blank" rel="noopener noreferrer">View evidence ↗</a><br><small>${escapeHTML(new Date(s.evidence.recordedAt).toLocaleString())}</small></article>`,
        )
        .join("")
    : "<p>No evidence recorded yet. Complete your brief and work through the delivery gates to build your release history.</p>";
}
async function loadTemplate() {
  const id = current._id;
  try {
    const data = await api(`/projects/${id}/export`);
    if (current._id !== id) return;
    template = data;
    $("dockerfileOutput").textContent = data.dockerfile;
    $("appEnvOutput").textContent = data.envTemplate;
    $("templateInstructions").textContent = data.instructions;
    $("templateDescription").textContent =
      stacks[current.stack] || "Starter template";
  } catch (e) {
    toast(e.message, true);
  }
}
async function health() {
  try {
    const r = await fetch("/api/health");
    const data = await r.json();
    if (!r.ok) throw new Error();
    $("healthStatus").textContent =
      data.database.engine === "local"
        ? "Development storage · local"
        : data.database.engine + " · connected";
  } catch {
    $("healthStatus").textContent = "Storage unavailable";
  }
}
function createDialog() {
  $("createForm").reset();
  showError("createError", "");
  $("createDialog").showModal();
  $("createName").focus();
}
$("newProjectBtn").addEventListener("click", createDialog);
$("emptyCreateBtn").addEventListener("click", createDialog);
$("cancelCreateBtn").addEventListener("click", () => $("createDialog").close());
$("projectSelect").addEventListener("change", (event) =>
  selectProject(event.target.value),
);
$("logoutBtn").addEventListener("click", logout);
$("mobileLogout").addEventListener("click", logout);
document
  .querySelectorAll("[data-view]")
  .forEach((button) =>
    button.addEventListener("click", () => changeView(button.dataset.view)),
  );
$("createForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.target.querySelector("[type=submit]");
  button.disabled = true;
  try {
    const data = await api("/projects", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.target))),
    });
    activeView = "brief";
    selectedStep = 1;
    updateProject(data.project);
    $("createDialog").close();
    toast("Application created. Start with your project brief.");
  } catch (e) {
    showError("createError", e.message);
  } finally {
    button.disabled = false;
  }
});
$("briefForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.target.querySelector("[type=submit]");
  const payload = {
    name: $("briefName").value,
    stack: $("briefStack").value,
    database: $("briefDatabase").value,
    brief: {
      goal: $("briefGoal").value,
      audience: $("briefAudience").value,
      repositoryUrl: $("briefRepository").value,
      acceptanceCriteria: $("briefAcceptance").value,
      owner: $("briefOwner").value,
      notes: $("briefNotes").value,
      cloud: $("briefCloud").value,
      region: $("briefRegion").value,
      domain: $("briefDomain").value,
      requirements: $("briefRequirements").value,
    },
  };
  const changed =
    payload.stack !== current.stack ||
    payload.database !== current.database ||
    JSON.stringify(payload.brief) !== JSON.stringify(current.brief);
  if (
    changed &&
    current.pipelineStages.some((s) => s.evidence) &&
    !confirm(
      "Changing the brief starts a new delivery cycle and clears current evidence. Have you saved the evidence links you need?",
    )
  )
    return;
  button.disabled = true;
  showError("briefError", "");
  try {
    const data = await api(`/projects/${current._id}/brief`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    selectedStep = data.project.readiness.nextStep || 8;
    updateProject(data.project);
    changeView("pipeline");
    toast(
      data.project.readiness.ready
        ? "Requirements saved. Review your deployment approach."
        : "Draft saved. Add the missing fields to continue.",
    );
  } catch (e) {
    showError("briefError", e.message);
  } finally {
    button.disabled = false;
  }
});
$("reviewBtn").addEventListener("click", async () => {
  try {
    const data = await api(`/projects/${current._id}/pipeline/run`, {
      method: "POST",
      body: "{}",
    });
    if (current.brief?.cloud) {
      changeView("pipeline");
      toast(data.message);
    } else {
      showError(
        "briefError",
        "Readiness review uses your saved brief.\n" +
          data.readiness.checks
            .filter((c) => !c.passed)
            .map((c) => "• " + c.action)
            .join("\n"),
      );
    }
  } catch (e) {
    toast(e.message, true);
  }
});
$("deleteProjectBtn").addEventListener("click", async () => {
  if (
    !confirm(`Permanently delete “${current.name}” and its delivery evidence?`)
  )
    return;
  try {
    await api(`/projects/${current._id}`, { method: "DELETE" });
    projects = projects.filter((p) => p._id !== current._id);
    selectProject(
      new URLSearchParams(location.search).get("project") || projects[0]?._id,
    );
    toast("Application deleted.");
  } catch (e) {
    toast(e.message, true);
  }
});
$("downloadBlueprintBtn").addEventListener("click", () => {
  if (!template)
    return toast("Template is still loading. Please try again.", true);
  const url = URL.createObjectURL(
    new Blob([template.dockerfile], { type: "text/plain" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "Dockerfile";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
(async () => {
  if (!token) return location.replace("/auth");
  try {
    const user = (await api("/auth/me")).user;
    currentUser = user;
    $("adminLink").hidden = !user.isAdmin;
    $("userName").textContent = user.firstName + " " + user.lastName;
    $("userAvatar").textContent = (user.firstName || user.username || "U")
      .charAt(0)
      .toUpperCase();
    projects = (await api("/projects")).projects;
    selectProject(
      new URLSearchParams(location.search).get("project") || projects[0]?._id,
    );
    health();
    setInterval(health, 30000);
  } catch (e) {
    $("loading").hidden = true;
    showError(
      "loadError",
      "Could not load the workspace. " + e.message + " Refresh to retry.",
    );
  }
})();
