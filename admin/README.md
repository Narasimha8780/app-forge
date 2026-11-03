# DevMatrix customer success console

Open `/admin/` on the same service as DevMatrix. It uses the existing `DB_ENGINE`, `MONGO_URI` / `DATABASE_URL`, `DB_NAME` and signing configuration; there is no separate database or admin password environment variable. The production Docker image includes this folder.

Register an ordinary account, then an authorized operator runs the following from the repository root in a trusted shell with the **same database configuration as the deployed service**:

```sh
node admin/set-role.js existing_username admin
```

Sign in through `/auth`, then open `/admin/`. To revoke access immediately, run `node admin/set-role.js existing_username user`. Authorization reads the account role from the database on every admin request, including existing sessions. Public registration always creates a regular user; no HTTP role-management endpoint exists. Never use shared demo credentials. Keep production database credentials in your normal secure runtime configuration.

The dashboard provides registration and open enquiry counts, searchable paginated users/enquiries, status filters, record details, and internal follow-up status/notes. Registrations begin as `new`, including older accounts with no support record. Statuses: `new`, `contacted`, `in_progress`, `resolved`. Updates record the administrator ID and timestamp; stale edits return a conflict instead of overwriting another administrator's notes. This stores the latest follow-up, not a full audit history. The console does not send email or SMS; the team uses its approved outreach channel and records the result. Internal notes are never added to public user or contact responses. Admin API responses explicitly exclude password hashes, GitHub tokens and credentials, and disable caching.

Public form: `/contact`, available from the top navigation. Submissions use the existing rate-limited `/api/contact` endpoint. Existing Cloud Run variables remain unchanged. The list API returns 20 records per page; the current storage abstraction filters and aggregates in process, so large installations should add database-level indexed pagination and aggregation.
