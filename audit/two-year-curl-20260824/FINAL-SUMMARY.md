# Two-Year Sequential Curl Audit — Final

- Run: `SIM-20260201-A546A6DC`
- Transport: curl / HTTP APIs only
- Direct database access: no
- Authoritative story executions: 919 / 919 passed
- Failed: 0; running: 0
- Initial target ERP operations: 2500
- Initial idempotent duplicate operations: 360
- Retry/reconciliation checks: 11 passed, 0 failed
- Assertions: 3587 passed, 0 failed, 585 skipped/non-observable
- Workflow API schema/reachability: 30 / 30 passed; returned workflow runs: 0

## Coverage boundary

- Confirmed: all 919 catalogued activities (Year 1: 127; Year 2: 792) and their 2500 target ERP API operations reached a final passed execution state.
- Year 2 has a complete April 2027–March 2028 monthly catalog. The Year 1 catalog has no executable entries for August or September 2026; therefore this audit is not evidence for those two calendar months.
- 585 story assertions were recorded as skipped because the target MicroERPs do not expose read-only diagnostics for those assertion kinds.
- All workflow endpoints returned valid empty collections for this fresh run. Reachability/schema is confirmed, but story-to-workflow correlation is not.

## Evidence

Initial request/response evidence is in `requests/`, `responses/`, and `headers/`; retry evidence is in `retries/`. Signed Year 2 catalogs are in `catalogs/`. Authorization and issued actor-token values are redacted from documented evidence.
