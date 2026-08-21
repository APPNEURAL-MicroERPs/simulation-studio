# APPNEURAL Simulation Studio

Developer-only Company Digital Twin for the MicroERP suite. The Studio reuses `@appneural/erp-core/simulation` and adds a persistent Cloudflare Worker runtime, D1 event store, scheduled clock, API-driven business stories, scenario injection, signed workflow projection, snapshots, and an operational control UI.

## Runtime guarantees

- The same seed and company date generate the same employee plans.
- Every processed employee action produces a business, activity, and audit event plus conditional workflow and notification events.
- Daily behaviour is role-aware across 64 employees and 10 behaviour families.
- Normal/minor/significant/critical distribution is 85/10/4/1.
- Scenario events share a correlation ID and retain causation links.
- Starting a new run completes the previous run instead of deleting its history.
- Scenario projections use a signed Cloudflare service binding to Organization workflow control.
- Business mutations in API stories go through the exact route used by each MicroERP portal; Studio D1 stores only simulation control, execution, and assertion evidence.
- Simulated actors use short-lived HMAC tokens bound to one employee, tenant, role, and run.
- Every target call carries `X-Simulation-Run`, `X-Simulation-Time`, `X-Correlation-Id`, and `X-Idempotency-Key`.
- Expected `403` responses are first-class passing permission assertions.
- Entity state is re-read through the target API and audit evidence is queried through a simulation-token-only read endpoint.
- Workflow, domain event, My Work, and notification assertions are marked `skipped/not observable` until their target MicroERP exposes evidence; they are never fabricated as passed.

## Six-month API twin

The master timeline covers 01 February through 31 July 2026. February currently has six deterministic executable stories across Attendance, Resource, Recruitment, and CRM, including a negative RBAC case. March–July are retained as explicit master-storyline outcomes in the API and Studio UI.

The scheduled clock executes due February stories automatically. The **API operations** screen can also run one story or all due February stories. `live`, `10×`, `60×`, `FAST`, and replay/scenario run profiles remain available; FAST is stored through a backward-compatible clock profile for databases created before Phase 2.

## Local development

```bash
npm install
npm run cf-typegen
npm run db:local
STUDIO_ADMIN_TOKEN=<local-token> \
EVENT_SIGNING_SECRET=<shared-local-signing-secret> \
SIMULATION_AUTH_SECRET=<shared-local-simulation-secret-at-least-32-characters> \
npm run dev
```

Open the local URL and enter `STUDIO_ADMIN_TOKEN` in the unlock dialog. The token is kept in `sessionStorage` for the current tab only.

## Cloudflare provisioning

Before the first production deploy:

1. Create a D1 database named `simulation-studio` and add its `database_id` to `wrangler.jsonc`.
2. Configure `STUDIO_ADMIN_TOKEN` with `wrangler secret put`.
3. Configure `EVENT_SIGNING_SECRET` with the same value used by the receiving MicroERPs.
4. Configure one 32+ character `SIMULATION_AUTH_SECRET` in Studio and every target MicroERP. The value must match.
5. Apply `npm run db:remote`.
6. Rebuild the target OpenNext Workers so the shared simulation auth code is bundled.
7. Run `wrangler deploy --dry-run`, then `npm run deploy`.

The intended production domain is `https://simulation.erp.appneural.com`.

## Integration scope

The Studio is authoritative for simulation clock, plans, activities, event graphs, API operation evidence, execution status, and snapshots. Scenario steps are materially stored in Studio D1 and projected into Organization workflow control using signed events. API story mutations are authoritative only in their target MicroERP database and are never inserted by Studio. Current executable API coverage is intentionally narrower than the complete 30-module master storyline; the Data Quality and API Operations views report that distinction explicitly.
