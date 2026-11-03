# Connect real deployments, logs, DNS, and HTTPS

The workspace can dispatch an approved Google Cloud Build trigger, poll its real build status, read Cloud Logging entries, check public DNS records, and inspect a domain's live TLS certificate. It never marks manual gates complete just because a build succeeded.

## Cloud Run variables and port

Use container port **8080**. Cloud Run injects `PORT`; do not add or override that variable manually. The Docker image binds to `0.0.0.0` and the supplied port.

For MongoDB:

```text
NODE_ENV=production
DB_ENGINE=mongodb
DB_NAME=forge
JWT_SECRET=<Secret Manager binding; random secret of at least 32 characters>
MONGO_URI=<Secret Manager binding; real MongoDB connection URI>
```

`DB_NAME=forge` selects the application database. If the URI path or `authSource` names a different database, application reads and writes still use `forge`; authentication uses the URI's `authSource`. Keep `authSource` equal to the database where that MongoDB account was created. URI options such as `directConnection` and `serverSelectionTimeoutMS` are respected.

A private MongoDB address requires Cloud Run Direct VPC egress or a Serverless VPC Access connector into the database's reachable VPC/subnet, appropriate routing/peering, and firewall access to TCP 27017 from the Cloud Run egress subnet or connector range. Configure this under Cloud Run networking; it is not an environment variable. Confirm MongoDB listens on the private interface. A direct connection targets one server and does not provide replica-set failover.

For PostgreSQL/MySQL replace `MONGO_URI` with secret `DATABASE_URL`, use `DB_ENGINE=postgres` or `mysql`, and enable `DB_SSL=true` for verified remote SQL TLS. `DB_SSL_CA_PATH` can point to a mounted CA file when required. Optional `CORS_ORIGINS` is needed only for cross-origin browser clients. Keep `JWT_SECRET` stable across revisions.

Add this **non-secret JSON configuration** as a Cloud Run environment variable named `DEPLOYMENT_TARGETS_JSON`. Replace every example identifier. The outer key is the workspace ID displayed under **Deployments & logs**. Each workspace needs an explicit operator-approved mapping:

```json
{
  "YOUR_24_CHARACTER_WORKSPACE_ID": {
    "googleProject": "your-google-project-id",
    "region": "us-central1",
    "triggerId": "YOUR_CLOUD_BUILD_TRIGGER_ID",
    "repository": "Narasimha8780/app-forge",
    "branch": "main",
    "serviceName": "your-cloud-run-service",
    "dnsRecords": [{ "type": "CNAME", "value": "ghs.googlehosted.com" }]
  }
}
```

The repository must match the workspace's saved brief. Use the actual trigger ID and region. The trigger must already be connected to that repository, reviewed by the operator, and configured with its required substitutions (including `_SERVICE_NAME`). Choose a dedicated service/repository per tenant: runtime logs are scoped to that configured service. Do not bind unrelated users to a shared application service or a shared build target. Use a staging target first.

This variable contains identifiers and DNS routing records, never credentials. There is no single platform-wide `GCP_PROJECT_ID`; each approved target specifies its Google project. Updating target configuration does not cancel running builds. Keep mappings stable while jobs are running.

## Runtime identity and Google APIs

Attach a dedicated service account to the **DevMatrix Cloud Run service**. Google authentication uses Application Default Credentials from this runtime identity. Do not upload a JSON service-account key or set `GOOGLE_APPLICATION_CREDENTIALS` in Cloud Run.

Enable Cloud Build and Cloud Logging APIs in the target project. Grant the runtime identity only the permissions needed to invoke/read approved builds and read the service logs. A custom role can include `cloudbuild.builds.create` and `cloudbuild.builds.get`; verify trigger access and `iam.serviceAccounts.actAs` on the trigger's build service account according to your organization's policy. `roles/cloudbuild.builds.editor` and `roles/logging.viewer` are broader predefined starting points; limit their resource scope and use log views/conditions where appropriate. Reading logs can require access to the configured log bucket/view. Private data-access logs require additional permissions and are not assumed available.

The **trigger's build service account** is a different identity. It needs Artifact Registry write, Cloud Run deployment/IAM permissions appropriate to the trigger, and Service Account User on the customer application's runtime service account. Never let customer repositories execute under the platform's broadly privileged identity. Review the trigger YAML and deployment approvals before approving a workspace mapping.

Runtime egress must allow `cloudbuild.googleapis.com`, `logging.googleapis.com`, Google credential acquisition through the supported runtime identity, public DNS resolution, and public TLS connections on port 443 for owned domains. A restricted development environment may not allow these operations even when the code is configured.

## Deployment behavior

1. Save a complete brief and ask the operator to add the approved mapping.
2. Open **Deployments & logs**. Review the repository, fixed branch, and service.
3. Acknowledge that the trigger may modify the target and click **Run approved trigger**.
4. The server persists a run and claims the project before dispatch. Duplicate request IDs return the existing run. An active run blocks another submission and blocks scope changes/deletion.
5. Status comes from Cloud Build. Build output and Cloud Run logs refresh every ten seconds while the view is visible. Each response is limited to the newest 100 log entries; open Google Cloud for the full history. Cloud Logging can have ingestion delay.

`SUCCESS` means the configured Cloud Build workflow succeeded. It does not imply a health check ran, a specific URL serves the intended app, or manual stages were independently audited. The supplied `cloudbuild.yaml` does **not** include a post-deployment HTTP health-check step, as requested. Its trigger still builds, pushes, and deploys the image.

If a submission times out, its state becomes `SUBMISSION_UNKNOWN`: Google may already have accepted it. It must not be automatically retried. A process failure after claiming a run can leave `SUBMITTING` for the same reason. An operator must inspect Cloud Build using the recorded workspace, target, and timestamp. After confirming the actual build ID, an operator can reconcile the stored deployment record with the correct `buildId`, regional `operationName`, and provider status. If Google demonstrably did not create a build, mark that record `FAILURE` before allowing a new request. Never clear an unresolved claim merely to get past the UI.

This milestone does not include a durable worker/reconciliation daemon, cancellation, automated rollback, or provider-independent runners. Refreshing the UI reconciles known operation/build IDs. Jobs continue in Google Cloud when a browser closes. Operators must reconcile a lost submission before another run.

Logs are not persisted by DevMatrix. Common bearer tokens, credential URLs, and key/value secrets are redacted, but redaction is not a guarantee: applications must not log secrets. Treat log access as access to potentially sensitive application data.

## Domain verification and mapping

1. Save a hostname, such as `app.example.com`, under **Domains & HTTPS**.
2. Publish the exact TXT challenge shown at `_devmatrix-challenge.app.example.com`. Some registrars append the zone name automatically, so enter the relative record name when their UI requires it.
3. Configure the custom-domain mapping in Cloud Run or your load balancer. Publish the records it provides. Domain registration, DNS writes, and mapping creation are not performed by DevMatrix.
4. Ask the operator to copy the actual expected records into that workspace's `dnsRecords` array. The CNAME above is only an example for a compatible subdomain mapping; apex domains or load balancers may require A/AAAA records instead. Every configured value is compared against the saved hostname's observed records.
5. Click **Check DNS & HTTPS**. The result records observed A/AAAA/CNAME records, TXT ownership, expected-record matches, and the time checked. Resolver errors remain errors; propagation delays are not reported as success.

Certificate inspection runs only after the exact TXT ownership challenge is visible and **all** resolved addresses are public. It connects to a pinned resolved address with the saved hostname as TLS SNI, keeps trust and hostname verification enabled, and reports validity, issuer, expiry, and days remaining. Certificates with 14 days or less remaining are labelled expiring. The platform never disables certificate verification to obtain a passing result.

Cloud Run or your configured proxy issues and renews certificates. DevMatrix inspects status; it does not issue certificates, change DNS, purchase domains, or guarantee renewal. DNS and TLS are point-in-time checks, not proof that the intended application is serving content. This milestone does not schedule background domain checks or renewal alerts.

## Validation limits

Local tests exercise tenant isolation, operator mappings, idempotency, unknown submissions, provider request/response contracts, scoped logging queries, DNS ownership, private-address blocking, and verified TLS inspection with controlled fixtures. These fixtures are not proof of live Google Cloud access. Production end-to-end validation requires the real runtime identity, configured trigger, durable database, a domain you control, and the appropriate egress.
