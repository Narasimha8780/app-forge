# How the user journey and pipeline work

## Account → sign in → first application

Registration creates only a user account. It returns no session token and creates no application. The browser shows an account-created popup and takes the user to sign-in. Successful login issues a session, then loads the user's own applications. A new account sees a named welcome and an empty dashboard with **Create new app**. Login and dashboard reads never create applications, including after a user deletes their last app.

An application is created only when the user submits the create-app form with a name, runtime, and database choice. Existing applications are preserved; this change does not delete applications that were created by previous versions.

## Connect a GitHub repository

In the project brief, choose **Connect GitHub**, approve the requested GitHub permissions, then select a repository from the returned list. Selecting a repository fills the brief's URL field. Save the brief to apply the selection. A manually entered URL remains supported.

The connection belongs to the signed-in DevMatrix account. Access tokens remain server-side, encrypted with AES-256-GCM using a key derived from the stable `JWT_SECRET`. The browser receives account and repository metadata only. OAuth uses a short-lived HttpOnly state cookie and PKCE. Changing `JWT_SECRET` invalidates existing sessions and the ability to decrypt existing GitHub connections; users must disconnect/reconnect after rotation.

The default `read:user` scope permits a public-profile connection and repository listing within that token's access. Private repositories require the operator to explicitly configure the broader `repo` scope and the user to approve it. That scope grants more than read-only access; review the consent screen and organization SSO/access policies. The app uses repository listing only, not write APIs. A GitHub App with installation-scoped permissions is a future alternative for narrower private-repository access.

Connecting GitHub does not automatically create a Cloud Build trigger or grant deployment access. A repository can be selected before a deployment operator approves a target.

## Eight manual delivery gates

| Gate                   | Work                                                           | Evidence to record                          |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| 1. Define & design     | Confirm scope, audience, acceptance criteria, and architecture | Approved brief/design document              |
| 2. Build & integrate   | Implement core functionality and integrations                  | Commit or reviewed pull request             |
| 3. Test the behavior   | Run unit/integration tests and important user journeys         | Actual CI test report                       |
| 4. Review code quality | Run lint/static analysis and review the changes                | Review or analysis results                  |
| 5. Check security      | Inspect dependencies, images, secrets, and permissions         | Scan report and risk decisions              |
| 6. Prepare data        | Configure storage, migrations, backups, and restoration        | Data/restore report, or stateless rationale |
| 7. Release to staging  | Build/deploy an immutable artifact and review rollback         | Build record and staging release link       |
| 8. Launch & operate    | Approve production, health, monitoring, and support            | Production/operational handover             |

A complete saved brief is required before recording evidence. Gates are completed in order; each requires review notes, an HTTPS evidence link, and the owner's acknowledgement. These are owner attestations. The app does not invent test results, run all eight stages on a timer, or independently audit the supplied evidence.

Changing the brief or selected runtime/database starts a new manual evidence cycle. Save external records first. Scope changes and deletion are blocked while a deployment is active or unresolved.

## Real deployments and logs

After the brief is complete, an operator maps the workspace ID to a fixed repository, branch, Cloud Build trigger, and dedicated Cloud Run service through `DEPLOYMENT_TARGETS_JSON`. The user explicitly authorizes **Run approved trigger** under **Deployments & logs**. This can be used to obtain staging/build evidence for the manual gates; it is a separate action from recording those gates.

The server persists the request and invokes the approved Cloud Build trigger. The trigger's own YAML performs its configured build/deploy steps. Build status and build/runtime logs come from Google APIs and refresh while the page is visible. A duplicate request does not start another build. Unknown submissions require operator reconciliation before retrying.

A provider `SUCCESS` means its configured workflow finished successfully. It does not automatically mark the eight gates complete, prove application health, or approve production. The platform's current `cloudbuild.yaml` contains no post-deployment HTTP health-check step, as requested.

## Domain and HTTPS

The user saves a domain and publishes a TXT challenge. **Domains & HTTPS** checks public DNS, compares operator-provided expected routing records, and inspects a trusted hostname-matching TLS certificate after ownership verification. DNS changes, Cloud Run domain mapping, and certificate issuance/renewal remain with the hosting/DNS providers.

See [operations setup](OPERATIONS.md) for deployment IAM, runtime variables, domain records, status handling, and validation limits.

## Enable GitHub OAuth on Cloud Run

Create a GitHub **OAuth App** under your GitHub developer settings. Set its homepage to your canonical application origin and its authorization callback to:

```text
https://YOUR_APPLICATION_DOMAIN/api/github/callback
```

Add these Cloud Run environment settings:

```text
APP_BASE_URL=https://YOUR_APPLICATION_DOMAIN
GITHUB_CLIENT_ID=<OAuth App client ID>
GITHUB_CLIENT_SECRET=<Secret Manager binding: OAuth App client secret>
GITHUB_OAUTH_SCOPE=read:user
```

`APP_BASE_URL` must exactly match the origin used to open the UI; the state cookie cannot cross between a Cloud Run hostname and a different custom domain. Use HTTPS in production. For local testing only, `http://127.0.0.1:PORT` and `http://localhost:PORT` are supported, with the corresponding GitHub callback configured.

For private-repository access, an operator may set `GITHUB_OAUTH_SCOPE=read:user repo`; users must reconnect and grant the additional scope. GitHub OAuth credentials are separate from the Cloud Run runtime identity used to dispatch Cloud Build jobs. No GitHub PAT is required from users.

Allow outbound HTTPS to `github.com` and `api.github.com`. With no OAuth configuration, the connection button is disabled and manual repository URL entry still works. Disconnect removes the stored credential and attempts GitHub token revocation; if remote revocation fails, the UI directs the user to GitHub's application settings.

The implementation is validated with controlled OAuth/provider fixtures and browser checks. A real GitHub connection requires the operator-provided OAuth App credentials and callback configuration.
