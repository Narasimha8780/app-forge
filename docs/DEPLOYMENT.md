# Deploy DevMatrix Studio to Cloud Run

This deploys the DevMatrix platform. Customer Java, Node.js, and Python applications are separate repositories and releases. Their workspace exports are starting templates, not a hosted remote-execution service.

## Runtime environment variables

Configure these on **Cloud Run**, not as Cloud Build secrets or build arguments. Never bake credentials into images. Use Secret Manager references for credential values.

| Variable           | Required / example                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`         | `production` (set by Dockerfile)                                                                                                  |
| `JWT_SECRET`       | Secret: random value, at least 32 characters; keep stable across instances and revisions                                          |
| `DB_ENGINE`        | `mongodb`, `postgres`, or `mysql`                                                                                                 |
| `MONGO_URI`        | MongoDB only, secret: `mongodb+srv://…` or authenticated MongoDB URI                                                              |
| `DB_NAME`          | MongoDB only; default `devmatrix_db`                                                                                              |
| `DATABASE_URL`     | SQL only, secret: `postgresql://user:password@host:5432/db` or `mysql://user:password@host:3306/db`                               |
| `DB_SSL`           | `true` for remote SQL with TLS; defaults to false for local development                                                           |
| `DB_SSL_CA_PATH`   | Optional mounted CA certificate file for managed SQL TLS; certificates must match the hostname                                    |
| `CORS_ORIGINS`     | Optional comma-separated origins for browser clients on other domains, e.g. `https://studio.example.com`; omit for same-origin UI |
| `TRUST_PROXY_HOPS` | Default `1` for Cloud Run; change only for your actual trusted proxy topology                                                     |
| `PORT`             | Injected by Cloud Run. Do not configure manually there. Local default `5000`.                                                     |

Generate a signing secret locally with `openssl rand -hex 48` and add it securely to Secret Manager. Never post or commit it. Percent-encode special characters in SQL URI usernames/passwords. Do not include SQL `sslmode` query parameters that conflict with `DB_SSL`; use `DB_SSL=true` and, if needed, a mounted `DB_SSL_CA_PATH`. TLS verification stays enabled.

There is **no production file fallback**. Startup fails if the selected database or signing secret is unavailable. A lost database connection causes the readiness endpoint to return 503. Data is not automatically moved between engines. Export, transform, validate, and back up records before changing storage engines. Existing MongoDB duplicate usernames/emails/mobile numbers must be resolved before unique indexes can be created.

SQL uses a `devmatrix_documents` table with JSON/JSONB documents and unique account identifiers. It is an initial compatibility model, not a normalized reporting schema; collection reads currently filter in the application. Plan indexed domain tables before large datasets. The database role must create this table/indexes on first start, or an operator must provision the identical schema beforehand. Use a dedicated database/schema. PostgreSQL, MySQL, MongoDB, and local integration tests exercise the same API contract.

## Prerequisites

1. Enable Cloud Run, Cloud Build, Artifact Registry, and Secret Manager APIs.
2. Create an Artifact Registry Docker repository (`narasimha8780`) in your selected region.
3. Create a dedicated runtime service account. Grant Secret Manager Secret Accessor only on the relevant runtime secrets. Grant Cloud SQL Client if using Cloud SQL connectors.
4. Configure database connectivity: Atlas IP access/networking for MongoDB, or VPC connectivity/Cloud SQL for SQL. Do not expose a private database publicly to make connectivity work. Use a reachable hostname and verified TLS. Cloud SQL socket/connector configuration must be added for your topology; this app's URL configuration supports ordinary TCP endpoints.
5. Create runtime secrets `app-forge-jwt` and either `app-forge-database` or `app-forge-database`. Do not reuse the development example values.
6. Grant the build service account Artifact Registry Writer, Cloud Run Admin (the supplied public-service deployment sets IAM access), and Service Account User on the selected runtime service account. Scope grants to the required resources. Configure the trigger's build service account explicitly.

## Cloud Build trigger

Connect the GitHub repository `Narasimha8780/app-forge`, select branch `main`, and use `cloudbuild.yaml`. The Artifact Registry Docker repository is **`narasimha8780`**, in **`us-central1`**. GitHub's repository name and Artifact Registry's repository name are separate.

Set this custom substitution in the Cloud Build trigger:

```text
_SERVICE_NAME=YOUR_CLOUD_RUN_SERVICE_NAME
```

The image paths follow your requested layout:

```text
us-central1-docker.pkg.dev/PROJECT_ID/narasimha8780/app-forge/web/BRANCH_NAME:COMMIT_SHA
us-central1-docker.pkg.dev/PROJECT_ID/narasimha8780/app-forge/web:latest
```

`PROJECT_ID`, `BRANCH_NAME`, and `COMMIT_SHA` are built-in GitHub branch-trigger substitutions. Use the `main` branch for this deployment. For a manual build, supply `BRANCH_NAME=main` and a commit SHA. Other branch names must contain valid lowercase Docker path characters; branches with uppercase names are not suitable for this image layout.

Configure application runtime ENVs, Secret Manager bindings, runtime service account, and database networking **in Cloud Run**. The YAML deliberately does not overwrite those settings. At minimum set `DB_ENGINE=mongodb` (or `postgres`/`mysql`), bind `JWT_SECRET`, and bind `MONGO_URI` (MongoDB) or `DATABASE_URL` (SQL). Use `DB_SSL=true` for verified remote SQL TLS. See the full runtime variable table above. The first service creation needs these settings too; create/configure the service with an initial image and its runtime settings before using the ongoing GitHub trigger, or include them in your initial manual deployment. Startup will fail if required secrets or database connectivity are missing.

The build service account needs Service Account User on the runtime service account configured in Cloud Run. This YAML uses the service's existing account, or Cloud Run's default for a new service. No secret values or database settings belong in Docker build arguments. `VITE_API_URL` is omitted because this app uses an Express-served, same-origin frontend without a Vite build step.

The pipeline runs real tests, attempts to pull the previous `latest` image for caching, builds with inline cache metadata, tags the image with the commit SHA and `latest`, pushes both, deploys the immutable commit tag, and checks `/api/health`. A missing cache is tolerated; build, test, push, deploy, and health failures fail the pipeline. `latest` is a cache tag, not proof of a successful production release.

The supplied deployment explicitly makes the website public with `--allow-unauthenticated`; the application still requires login for workspaces. If your organization requires IAM ingress, remove that flag and adapt the health request to supply an authorized identity token. The build service account needs permission to set public access, not merely update the container image.

A failed health check fails the build; it does not automatically roll back traffic. Enable approval on a production trigger, use a staging service first, and explicitly roll back to the previous known-good revision on failure. No cloud deployment is executed merely by committing these files.

## Operational checklist

- Exercise registration, login, and project persistence after deployment. Restart a revision and confirm data survives.
- Test tenant separation and collect real CI/security reports for application releases.
- Configure a custom domain, uptime alerts, error reporting, retention, database backups, and a tested restore runbook.
- Set budgets, instance limits, and connection limits based on load tests. The SQL pool uses ten connections per instance.
- Rate limiting in this starter is per process; use a shared limiter/edge protection for distributed production traffic. LocalStorage bearer sessions remain vulnerable to any future XSS; retain the strict CSP and plan HttpOnly cookies, CSRF handling, session revocation, account recovery, and email verification for a public identity service.
- Set a secret-rotation and dependency-update process. Integration credentials belong in your application secret manager; the workspace never stores them.
- Evidence is an owner attestation, not an independent audit or CI callback. For team review, build roles, approval separation, CI webhooks with signature verification, and an append-only audit store before treating gates as compliance controls.
