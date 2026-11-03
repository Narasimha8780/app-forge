"use strict";
const $ = (id) => document.getElementById(id);
const token =
  localStorage.getItem("devmatrix_token") ||
  localStorage.getItem("appforge_token");
let projects = [],
  current,
  selectedStep = 1,
  activeView = "brief",
  template,
  toastTimer;
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
  document
    .querySelectorAll(".view")
    .forEach((e) => (e.hidden = e.id !== "view-" + view));
  document.querySelectorAll("[data-view]").forEach((e) => {
    e.classList.toggle("active", e.dataset.view === view);
    e.setAttribute("aria-current", e.dataset.view === view ? "page" : "false");
  });
  if (view === "resources" && current) loadTemplate();
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
    $("pageTitle").textContent = "Your delivery workspace";
    $("breadcrumbProject").textContent = "Applications";
    return;
  }
  $("projectSelect").value = current._id;
  $("pageTitle").textContent = current.name;
  $("breadcrumbProject").textContent = current.name;
  $("pageDescription").textContent =
    "Your application, from a focused brief to an operational handover.";
  const completed = current.pipelineStages.filter(
    (s) => s.status === "completed",
  ).length;
  $("progressValue").textContent = completed + " / 8";
  $("progressFill").style.width = (completed / 8) * 100 + "%";
  $("progressBar").setAttribute("aria-valuenow", completed);
  const next = current.pipelineStages.find((s) => s.status !== "completed");
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
    ? "Ready for delivery"
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
  renderStages();
  renderActivity();
  changeView(activeView);
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
    toast(
      data.project.readiness.ready
        ? "Brief saved. You can start the delivery pipeline."
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
    if (data.readiness.ready) {
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
    selectProject(projects[0]?._id);
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
    $("userName").textContent = user.firstName + " " + user.lastName;
    $("userAvatar").textContent = user.firstName[0].toUpperCase();
    projects = (await api("/projects")).projects;
    selectProject(projects[0]?._id);
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
