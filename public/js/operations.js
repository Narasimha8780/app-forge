/* Real provider operations are deliberately separate from manual delivery gates. */
(() => {
  const el = (id) => document.getElementById(id);
  const terminal = new Set([
    "SUCCESS",
    "FAILURE",
    "INTERNAL_ERROR",
    "TIMEOUT",
    "CANCELLED",
    "EXPIRED",
  ]);
  let workspace,
    view,
    configuredTarget,
    runs = [],
    selectedId = "",
    pendingRequestId,
    loading = false;
  const endpoint = (suffix) => `/projects/${workspace._id}${suffix}`;
  const active = () => runs.some((job) => !terminal.has(job.status));
  function error(id, message = "") {
    el(id).textContent = message;
    el(id).hidden = !message;
  }
  function controls() {
    el("startDeploymentBtn").disabled =
      !configuredTarget ||
      !workspace?.readiness.ready ||
      !el("deploymentAcknowledge").checked ||
      active() ||
      loading;
  }
  async function loadConnection() {
    if (!workspace) return;
    const id = workspace._id;
    try {
      const data = await api(endpoint("/deployments"));
      if (workspace?._id !== id) return;
      configuredTarget = data.target;
      runs = data.deployments;
      el("operationsWorkspaceId").textContent = data.workspaceId;
      el("deploymentConnection").textContent = configuredTarget
        ? "Approved target"
        : "Not connected";
      el("deploymentTarget").textContent = configuredTarget
        ? `${configuredTarget.repository} · ${configuredTarget.branch} → ${configuredTarget.serviceName} (${configuredTarget.region})`
        : "No deployment target approved for this workspace.";
      el("deploymentSetup").textContent = configuredTarget
        ? "This trigger runs using the platform service account. Review the configured repository and target before dispatching."
        : "Ask the operator to add this workspace ID to DEPLOYMENT_TARGETS_JSON. The connection must match your saved brief repository.";
      if (!runs.some((job) => job._id === selectedId))
        selectedId = runs[0]?._id || "";
      el("deploymentSelect").replaceChildren(
        ...(runs.length
          ? runs.map(
              (job) =>
                new Option(
                  `${new Date(job.createdAt).toLocaleString()} · ${job.status}`,
                  job._id,
                ),
            )
          : [new Option("No runs yet", "")]),
      );
      el("deploymentSelect").value = selectedId;
      error("deploymentError");
      renderJob();
      controls();
      if (selectedId) await refreshJob();
    } catch (e) {
      if (workspace?._id === id) {
        configuredTarget = null;
        controls();
        error("deploymentError", e.message);
      }
    }
  }
  function renderJob() {
    const job = runs.find((j) => j._id === selectedId);
    el("deploymentStatus").textContent = job?.status || "No run selected";
    const selectedOption = Array.from(el("deploymentSelect").options).find(
      (option) => option.value === job?._id,
    );
    if (selectedOption && job)
      selectedOption.textContent = `${new Date(job.createdAt).toLocaleString()} · ${job.status}`;
    el("deploymentProviderLink").replaceChildren();
    if (!job) {
      el("deploymentSummary").textContent =
        "Run the approved trigger to see its provider status.";
      el("deploymentLogs").textContent = "No provider logs loaded.";
      el("deploymentLogNote").textContent = "";
      return;
    }
    el("deploymentSummary").textContent =
      job.message ||
      (job.status === "SUCCESS"
        ? "The Cloud Build workflow succeeded. Review its configured release steps and verify the live service before approving release."
        : `Provider status: ${job.status}. Build ${job.buildId || "identifier is pending"}.`);
    if (job.logUrl?.startsWith("https://console.cloud.google.com/")) {
      const link = document.createElement("a");
      link.href = job.logUrl;
      link.textContent = "Open build in Google Cloud ↗";
      link.className = "text-link";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      el("deploymentProviderLink").append(link);
    }
  }
  async function refreshJob() {
    if (!workspace || !selectedId || loading) return;
    const projectId = workspace._id,
      jobId = selectedId;
    loading = true;
    controls();
    try {
      const { deployment } = await api(endpoint(`/deployments/${jobId}`));
      if (workspace?._id !== projectId || selectedId !== jobId) return;
      runs = runs.map((job) => (job._id === jobId ? deployment : job));
      renderJob();
      const log = await api(
        endpoint(
          `/deployments/${jobId}/logs?kind=${el("deploymentLogKind").value}`,
        ),
      );
      if (workspace?._id !== projectId || selectedId !== jobId) return;
      el("deploymentLogs").textContent =
        log.lines
          .map((line) => `${line.timestamp} [${line.severity}] ${line.message}`)
          .join("\n") ||
        (log.pending
          ? "Waiting for the provider build identifier."
          : "No matching log entries yet. Cloud Logging delivery can be delayed.");
      el("deploymentLogNote").textContent =
        `Last refreshed ${new Date().toLocaleTimeString()}. ${log.truncated ? "Showing the latest 100 entries; open Google Cloud for complete logs." : ""}`;
      error("deploymentError");
    } catch (e) {
      if (workspace?._id === projectId) error("deploymentError", e.message);
    } finally {
      loading = false;
      controls();
    }
  }
  el("deploymentAcknowledge").addEventListener("change", controls);
  el("refreshDeploymentsBtn").addEventListener("click", loadConnection);
  el("deploymentSelect").addEventListener("change", () => {
    selectedId = el("deploymentSelect").value;
    el("deploymentLogs").textContent = "Loading selected run…";
    renderJob();
    refreshJob();
  });
  el("deploymentLogKind").addEventListener("change", refreshJob);
  el("startDeploymentBtn").addEventListener("click", async () => {
    if (!workspace || loading) return;
    const id = workspace._id;
    loading = true;
    controls();
    pendingRequestId ||= crypto.randomUUID();
    let dispatchError;
    try {
      const data = await api(endpoint("/deployments"), {
        method: "POST",
        body: JSON.stringify({
          requestId: pendingRequestId,
          acknowledged: el("deploymentAcknowledge").checked,
        }),
      });
      if (workspace?._id !== id) return;
      pendingRequestId = null;
      selectedId = data.deployment._id;
      el("deploymentAcknowledge").checked = false;
      error("deploymentError");
    } catch (e) {
      dispatchError = e.message;
      if (workspace?._id === id) selectedId = "";
    } finally {
      loading = false;
      controls();
      if (workspace?._id === id) {
        await loadConnection();
        if (
          pendingRequestId &&
          runs.some((job) => job.requestId === pendingRequestId)
        )
          pendingRequestId = null;
        if (dispatchError) {
          error("deploymentError", dispatchError);
          toast(dispatchError, true);
        }
      }
    }
  });
  function renderDomain(domain) {
    el("domainNameInput").value = domain?.name || "";
    el("domainInstructions").hidden = !domain;
    el("checkDomainBtn").disabled = !domain;
    el("domainOverall").textContent = domain
      ? "Pending checks"
      : "Not configured";
    if (!domain) return;
    el("domainChallenge").textContent =
      `Type: TXT\nName: _devmatrix-challenge.${domain.name}\nValue: devmatrix-verification=${domain.token}`;
    const result = domain.lastCheck;
    el("domainOwnership").textContent = result
      ? result.ownershipVerified
        ? "Verified"
        : "TXT pending"
      : "Not checked";
    el("domainRouting").textContent = result
      ? {
          matches: "DNS matches",
          mismatch: "Needs changes",
          expected_records_not_configured: "Target needed",
          pending_ownership: "TXT pending",
          blocked: "Blocked",
        }[result.mappingStatus] || "Unknown"
      : "Not checked";
    el("domainCertificate").textContent =
      result?.certificate.status.replaceAll("_", " ") || "Not checked";
    el("domainExpiry").textContent = result?.certificate.expiresAt
      ? `Expires ${new Date(result.certificate.expiresAt).toLocaleDateString()} · ${result.certificate.daysRemaining} days remaining`
      : "";
    el("domainCheckTime").textContent = result
      ? `Checked ${new Date(result.checkedAt).toLocaleString()}. This is a point-in-time check.`
      : "";
    el("domainRecordRows").replaceChildren();
    for (const type of ["A", "AAAA", "CNAME"]) {
      const row = document.createElement("tr");
      const expected = (result?.expected || []).filter(
        (record) => record.type === type,
      );
      for (const value of [
        type,
        (result?.records?.[type] || []).join(", ") || "No record observed",
        expected.length
          ? expected
              .map(
                (record) =>
                  record.value +
                  (record.matched ? " (matches)" : " (not matched)"),
              )
              .join(", ")
          : "Not specified by operator",
      ]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      el("domainRecordRows").append(row);
    }
    el("domainTLSMessage").textContent = result?.certificate.message || "";
    el("domainRecords").textContent = result
      ? JSON.stringify(
          {
            observed: result.records,
            expected: result.expected,
            certificate: result.certificate,
          },
          null,
          2,
        )
      : "Check DNS to load observed records.";
    el("domainOverall").textContent = result?.ownershipVerified
      ? "Ownership verified"
      : "Verify ownership";
  }
  async function loadDomain() {
    if (!workspace) return;
    const id = workspace._id;
    try {
      const data = await api(endpoint("/domain"));
      if (workspace?._id === id) {
        renderDomain(data.domain);
        error("domainError");
      }
    } catch (e) {
      if (workspace?._id === id) error("domainError", e.message);
    }
  }
  el("domainForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("[type=submit]"),
      id = workspace._id;
    button.disabled = true;
    try {
      const data = await api(endpoint("/domain"), {
        method: "PUT",
        body: JSON.stringify({ name: el("domainNameInput").value.trim() }),
      });
      if (workspace?._id === id) {
        renderDomain(data.domain);
        error("domainError");
        toast("Domain saved. Publish the TXT challenge, then check DNS.");
      }
    } catch (e) {
      if (workspace?._id === id) error("domainError", e.message);
    } finally {
      button.disabled = false;
    }
  });
  el("checkDomainBtn").addEventListener("click", async () => {
    const id = workspace._id;
    el("checkDomainBtn").disabled = true;
    try {
      const data = await api(endpoint("/domain/check"), {
        method: "POST",
        body: "{}",
      });
      if (workspace?._id === id) {
        renderDomain(data.domain);
        error("domainError");
      }
    } catch (e) {
      if (workspace?._id === id) error("domainError", e.message);
    } finally {
      el("checkDomainBtn").disabled = false;
    }
  });
  window.workspaceOperations = {
    open(project, nextView) {
      const changed = workspace?._id !== project?._id || view !== nextView;
      workspace = project;
      view = nextView;
      el("operationsWorkspaceId").textContent = project?._id || "";
      if (changed) {
        selectedId = "";
        configuredTarget = null;
        runs = [];
        pendingRequestId = null;
        el("deploymentAcknowledge").checked = false;
        controls();
        if (project && view === "operations") loadConnection();
        if (project && view === "domains") loadDomain();
      }
    },
  };
  setInterval(() => {
    if (view === "operations" && !document.hidden && workspace && selectedId)
      refreshJob();
  }, 10000);
})();
