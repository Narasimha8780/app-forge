# CloudOps customer success console

Open `/admin/` on the same service as CloudOps. It uses the existing `DB_ENGINE`, `MONGO_URI` / `DATABASE_URL`, `DB_NAME` and signing configuration; there is no separate database or admin password environment variable. The production Docker image includes this folder.

Register an ordinary account, then an authorized operator runs the following from the repository root in a trusted shell with the **same database configuration as the deployed service**:

```sh
node admin/set-role.js existing_username admin
```

Sign in through `/auth`, then open `/admin/`. To revoke access immediately, run `node admin/set-role.js existing_username user`. Authorization reads the account role from the database on every admin request, including existing sessions. Public registration always creates a regular user; no HTTP role-management endpoint exists. Never use shared demo credentials. Keep production database credentials in your normal secure runtime configuration.

The dashboard provides registration and open enquiry counts, searchable paginated users/enquiries, status filters, record details, and internal follow-up status/notes. Registrations begin as `new`, including older accounts with no support record. Statuses: `new`, `contacted`, `in_progress`, `resolved`. Updates record the administrator ID and timestamp; stale edits return a conflict instead of overwriting another administrator's notes. This stores the latest follow-up, not a full audit history. The console does not send email or SMS; the team uses its approved outreach channel and records the result. Internal notes are never added to public user or contact responses. Admin API responses explicitly exclude password hashes, GitHub tokens and credentials, and disable caching.

Public form: `/contact`, available from the top navigation. Submissions use the existing rate-limited `/api/contact` endpoint. Existing Cloud Run variables remain unchanged. The list API returns 20 records per page; the current storage abstraction filters and aggregates in process, so large installations should add database-level indexed pagination and aggregation.

## Separate Cloud Run service and subdomain

Use `admin/Dockerfile` and `admin/cloudbuild.yaml` for the standalone admin service. **The Docker build context must be the repository root**, since the admin reuses the database, user model and authentication modules. The image starts `admin/server.js`; `/` redirects to `/admin/`, `/auth` is the dedicated admin login, and `/api/health` checks database availability. Public registration, application projects, deployment triggers and contact submission endpoints are not exposed by this service. No cross-origin requests or CORS configuration are needed; admin login and API requests stay on the admin hostname.

Create a second Cloud Build trigger for this repository and select `admin/cloudbuild.yaml`. Keep the main app trigger pointed at the root `cloudbuild.yaml`. Override these substitutions as needed:

| Substitution | Default |
| --- | --- |
| `_SERVICE_NAME` | `devmatrix-admin` (use a different name from the main service) |
| `_REGION` | `us-central1` |
| `_ARTIFACT_REPOSITORY` | `narasimha8780` |

Create a Docker-format Artifact Registry repository in the selected region before running the build. The build service account needs registry write and Cloud Run deployment permissions, plus permission to act as the admin runtime service account. Use a dedicated runtime service account with access only to the required database secrets. The pipeline runs tests, builds a non-root image, pushes a unique `$BUILD_ID` tag and deploys the admin service. It leaves existing runtime environment variables and secret bindings in place. Configure those settings before sending traffic; a first deployment without them will fail startup. For local image verification: `docker build -f admin/Dockerfile -t devmatrix-admin .`.

### Admin service runtime settings (MongoDB)

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` (set by the image) |
| `DB_ENGINE` | `mongodb` |
| `MONGO_URI` | Secret Manager binding for the **same database connection** as the main app |
| `DB_NAME` | Exactly the same database name as the main app |
| `JWT_SECRET` | Stable random secret of at least 32 characters, bound from Secret Manager; a separate admin signing secret is recommended |
| `APP_PUBLIC_URL` | Optional main app HTTPS origin, e.g. `https://app.example.com`; enables links back to the main app |
| `PORT` | Supplied by Cloud Run; do not set manually |

PostgreSQL/MySQL deployments instead use the matching `DB_ENGINE`, the same `DATABASE_URL`, and verified TLS configuration (`DB_SSL`, optional `DB_SSL_CA_PATH`). GitHub OAuth and `DEPLOYMENT_TARGETS_JSON` are not needed for this service. Both services must have network access to the shared database. Separate signing secrets work because each subdomain has its own login and browser storage; user records/passwords and admin roles are shared through the database. No secrets belong in Cloud Build substitutions or image layers.

### Subdomain mapping

Map your user subdomain (for example `app.example.com`) to the existing main service and your admin subdomain (for example `admin.example.com`) to `devmatrix-admin`. Create each mapping in a supported Cloud Run domain-mapping region or use an external HTTPS load balancer with serverless NEGs. Publish the exact DNS ownership/routing records Google supplies; wait for the managed certificates, then verify HTTPS for both hostnames. Do not guess CNAME or IP values. No custom domain or DNS change is executed by this repository configuration.

On the admin subdomain, sign in at `https://admin.example.com/auth`, then open `/admin/`. Register the account on the main app first and assign its role with `node admin/set-role.js <username> admin` using the shared database configuration. No default admin account is created. The build allows unauthenticated HTTP access for the login page; the admin API still requires a signed session and a current database admin role. If you add IAP or IAM-only ingress, configure the corresponding browser identity flow separately.
