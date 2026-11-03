(() => {
  const el = (id) => document.getElementById(id);
  let project,
    loadedId,
    connected = false,
    page = 1,
    repositories = [],
    loading = false;
  function error(message = "") {
    el("githubError").textContent = message;
    el("githubError").hidden = !message;
  }
  function options() {
    const current = el("briefRepository").value;
    el("githubRepositorySelect").replaceChildren(
      new Option("Choose a repository", ""),
      ...repositories.map(
        (repo) =>
          new Option(
            `${repo.fullName}${repo.private ? " · Private" : ""}${repo.archived ? " · Archived" : ""}`,
            repo.url,
          ),
      ),
    );
    if (repositories.some((repo) => repo.url === current))
      el("githubRepositorySelect").value = current;
  }
  async function loadRepos(nextPage = 1) {
    if (!project || loading) return;
    loading = true;
    el("refreshReposBtn").disabled = true;
    el("loadMoreReposBtn").disabled = true;
    const id = project._id;
    try {
      const data = await api("/github/repositories?page=" + nextPage);
      if (project?._id !== id) return;
      page = data.page;
      repositories =
        nextPage === 1
          ? data.repositories
          : [
              ...repositories,
              ...data.repositories.filter(
                (repo) =>
                  !repositories.some((existing) => existing.url === repo.url),
              ),
            ];
      options();
      el("loadMoreReposBtn").hidden = !data.hasMore;
      error();
      if (!repositories.length)
        el("githubStatusText").textContent =
          "Connected. No repositories were returned with the granted access.";
    } catch (e) {
      if (project?._id === id) error(e.message);
    } finally {
      loading = false;
      el("refreshReposBtn").disabled = false;
      el("loadMoreReposBtn").disabled = false;
    }
  }
  async function load(nextProject, force = false) {
    project = nextProject;
    if (!project) {
      loadedId = null;
      return;
    }
    if (loadedId === project._id && !force) {
      options();
      return;
    }
    loadedId = project._id;
    const id = project._id;
    try {
      const status = await api("/github/status");
      if (project?._id !== id) return;
      connected = status.connected;
      el("githubStatusText").textContent = connected
        ? `Connected as ${status.login}`
        : status.configured
          ? "Connect GitHub to choose a repository from your account."
          : "GitHub OAuth is not configured yet. You can still enter a repository URL below.";
      el("connectGithubBtn").disabled = !status.configured;
      el("connectGithubBtn").hidden = connected;
      el("disconnectGithubBtn").hidden = !connected;
      el("githubRepositoryPicker").hidden = !connected;
      el("githubRevokeNote").hidden = !connected;
      el("githubScopeNote").textContent = (connected
        ? status.scopes
        : status.requestedScopes
      ).includes("repo")
        ? "This connection requests the broad GitHub repo scope, which permits private-repository access and more than read-only access. Review GitHub’s consent screen."
        : "The default connection requests read:user and lists repositories visible with that access. Private repositories require additional operator-configured permission and your consent.";
      error();
      if (connected) await loadRepos();
    } catch (e) {
      if (project?._id === id) {
        el("connectGithubBtn").disabled = true;
        error(e.message);
      }
    }
  }
  el("connectGithubBtn").addEventListener("click", async () => {
    if (!project) return;
    if (
      !confirm(
        "Continue to GitHub? Save any unsaved brief changes first. You will review the requested permissions on GitHub.",
      )
    )
      return;
    el("connectGithubBtn").disabled = true;
    try {
      const data = await api("/github/authorize", {
        method: "POST",
        body: JSON.stringify({ projectId: project._id }),
      });
      const url = new URL(data.url);
      if (url.origin !== "https://github.com")
        throw new Error("Unexpected GitHub authorization destination.");
      location.assign(url.href);
    } catch (e) {
      error(e.message);
      el("connectGithubBtn").disabled = false;
    }
  });
  el("disconnectGithubBtn").addEventListener("click", async () => {
    if (
      !confirm(
        "Disconnect GitHub? Saved repository URLs and existing applications will remain.",
      )
    )
      return;
    el("disconnectGithubBtn").disabled = true;
    try {
      const data = await api("/github/connection", { method: "DELETE" });
      repositories = [];
      await load(project, true);
      el("githubRevokeNote").hidden = !data.revokeRequired;
      toast(
        data.revokeRequired
          ? "Disconnected here. Also revoke access in GitHub settings."
          : "GitHub disconnected.",
      );
    } catch (e) {
      error(e.message);
    } finally {
      el("disconnectGithubBtn").disabled = false;
    }
  });
  el("githubRepositorySelect").addEventListener("change", () => {
    const url = el("githubRepositorySelect").value;
    if (!repositories.some((repo) => repo.url === url)) return;
    el("briefRepository").value = url;
    toast("Repository selected. Save the project brief to apply it.");
  });
  el("loadMoreReposBtn").addEventListener("click", () => loadRepos(page + 1));
  el("refreshReposBtn").addEventListener("click", () => loadRepos());
  window.githubConnection = { load };
  const result = new URLSearchParams(location.search).get("github");
  if (result)
    toast(
      result === "connected"
        ? "GitHub connected. Choose a repository in your brief."
        : result === "cancelled"
          ? "GitHub connection cancelled."
          : "GitHub connection did not finish. Check OAuth configuration and try again.",
      result === "error",
    );
})();
