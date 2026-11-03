# DevMatrix Studio

A guided delivery workspace for Java, Node.js, and Python applications. Define a brief, choose MongoDB/PostgreSQL/MySQL, and progress through eight release gates with owner-recorded evidence.

The platform provides a plan, runtime-specific container templates, and an evidence record. With an operator-approved Cloud Build target, it can dispatch real deployment jobs, follow provider status, and display build/runtime logs. It also checks owned domains’ DNS and TLS certificates. Builds, scans, migrations, and releases execute in the configured CI and cloud tools; manual delivery gates remain separate from provider status.

## Develop

Requires Node.js 24 and npm. Use the existing checkout; no additional worktree is required.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open the application on port 5000. Register an account; there is no supported shared demo credential. Development defaults to file storage. For local data isolation, set `LOCAL_DB_PATH` to a path outside tracked `data/db.json`. Production requires a durable database and a signing secret.

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
