# DevMatrix Studio

A requirements-first deployment planning workspace for Java, Node.js and Python apps on GCP, AWS or Azure. Users keep control of their cloud accounts; the primary workflow needs no cloud permissions or GitHub connection.

Create an app, then record its goal, audience, runtime, database, target cloud, region, constraints and optional custom domain. Save requirements to see a six-step approach:

1. App information and resource requirements.
2. Runtime dependencies and cloud-specific deployment files (Cloud Build, CodeBuild or Azure Pipelines).
3. Cloud resources, database setup, IAM, networking and security.
4. Build-time and runtime environment variables and secret references.
5. Testing, error diagnosis, reviewed fixes, staging deployment and rollback.
6. Domain mapping, DNS, HTTPS and operational handover.

Plans use Cloud Run, ECS Fargate and Container Apps as initial container hosting choices. They are review checklists, not repository inspections or cloud readiness reports. Users run commands, inspect resources and apply fixes in their own tools. Requirements and region are preserved with the app; no secret values should be entered. Runtime Dockerfiles remain downloadable starters that must be adapted to the actual repository. Optional historical evidence gates remain available in a collapsed section. Legacy provider integration APIs are retained, but the primary dashboard does not load or request them.

## Develop

Requires Node.js 24 and npm. Use the existing checkout; no additional worktree is required.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open the application on port 5000. Register an account, then sign in. New accounts start with an empty dashboard; applications are created only through Create new app. There is no supported shared demo credential. Development defaults to file storage. For local data isolation, set `LOCAL_DB_PATH` to a path outside tracked `data/db.json`. Production requires a durable database and a signing secret.

```sh
npm test
```

Tests create an isolated temporary local store by default. Set `DB_ENGINE` and the relevant connection variables to exercise an external disposable database. External tests write records, so never point them at production. GitHub Actions runs the same suite against local storage, PostgreSQL, MySQL, and MongoDB.

## Delivery flow

1. Create an application and select Node.js/Express, Java/Spring Boot, or Python/FastAPI.
2. Define the goal, audience, repository, release owner, and acceptance criteria. Include accessibility, privacy, cost, recovery, and support needs.
3. Review the saved brief's readiness. Missing fields remain actionable; readiness does not claim the app was built.
4. Work through define/design, implementation, testing, review, security, data, staging, and operations.
5. Attach an HTTPS evidence link and explain the outcome at each stage. Earlier gates must be recorded first. Evidence is explicitly an owner attestation.
6. Export a starter Dockerfile, run and verify it in your repository, and configure secrets in your cloud provider.

Changing the brief or stack starts a new delivery cycle and clears current evidence; keep external records as your durable source of truth. Legacy stages with no owner evidence are displayed as pending. Existing legacy secret fields are excluded from project responses; remove old stored plaintext credentials from the database and rotate them if previously used.

## Deploy

See [Cloud Run and Cloud Build setup](docs/DEPLOYMENT.md) for runtime ENVs, Secret Manager bindings, trigger substitutions, database networking, IAM, deployment, and operational limitations. The included `Dockerfile` runs this platform; exported Dockerfiles target customer applications.

- `DB_ENGINE=local` — development only, no automatic fallback or cross-engine migration.
- `DB_ENGINE=mongodb` — native MongoDB collections with account uniqueness indexes.
- `DB_ENGINE=postgres` / `mysql` — SQL-backed JSON document store, account uniqueness constraints, parameterized queries, and optimistic updates.

The database selected inside an application brief describes that application's architecture. It does not change the database used by DevMatrix itself; configure the platform's `DB_ENGINE` separately.

## Real operations

See [deployment jobs, live logs, DNS, and certificate setup](docs/OPERATIONS.md) for Cloud Run ENVs and port, `DEPLOYMENT_TARGETS_JSON`, runtime IAM, log scopes, and domain ownership verification. These integrations remain unconfigured until an operator supplies the target mappings and runtime identity permissions. No customer job is automatically launched by opening the UI.

## Signup, GitHub, and pipeline behavior

See [the user journey and pipeline guide](docs/PIPELINE.md) for explicit login after signup, an empty first dashboard, GitHub OAuth/repository selection, the eight manual gates, and the separate real deployment/log/DNS integrations. GitHub OAuth requires `APP_BASE_URL`, `GITHUB_CLIENT_ID`, and Secret Manager-backed `GITHUB_CLIENT_SECRET`.
