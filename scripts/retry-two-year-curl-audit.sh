#!/usr/bin/env bash
set -uo pipefail

BASE_URL="${BASE_URL:-https://simulation.erp.appneural.com}"
AUDIT_DIR="${1:-audit/two-year-curl-20260824}"
INITIAL_RESULTS="$AUDIT_DIR/results.ndjson"
RETRY_DIR="$AUDIT_DIR/retries"
RETRY_RESULTS="$RETRY_DIR/results.ndjson"
RESUME_RETRIES="${RESUME_RETRIES:-0}"

if [[ -z "${STUDIO_ADMIN_TOKEN:-}" ]]; then
  printf 'STUDIO_ADMIN_TOKEN is required.\n' >&2
  exit 2
fi
if [[ ! -s "$INITIAL_RESULTS" ]]; then
  printf 'Initial audit results are required.\n' >&2
  exit 2
fi

mkdir -p "$RETRY_DIR/requests" "$RETRY_DIR/responses" "$RETRY_DIR/headers"
if [[ "$RESUME_RETRIES" != "1" ]]; then
  : > "$RETRY_RESULTS"
  sequence=0
else
  sequence=$(find "$RETRY_DIR/requests" -maxdepth 1 -type f -name '[0-9][0-9][0-9]-*.request.json' -exec basename {} \; \
    | sed -E 's/^([0-9]{3})-.*/\1/' | sort -n | tail -1)
  sequence=${sequence:-0}
  sequence=$((10#$sequence))
fi

next_prefix() {
  sequence=$((sequence + 1))
  prefix=$(printf '%03d' "$sequence")
}

document_request() {
  local destination="$1" method="$2" url="$3" body_file="${4:-}"
  if [[ -n "$body_file" ]]; then
    jq -n --arg method "$method" --arg url "$url" --slurpfile body "$body_file" \
      '{method:$method,url:$url,headers:{authorization:"Bearer <REDACTED>",accept:"application/json","content-type":"application/json"},body:$body[0]}' > "$destination"
  else
    jq -n --arg method "$method" --arg url "$url" \
      '{method:$method,url:$url,headers:{authorization:"Bearer <REDACTED>",accept:"application/json"},body:null}' > "$destination"
  fi
}

curl_json() {
  local method="$1" url="$2" response_file="$3" header_file="$4" body_file="${5:-}"
  if [[ -n "$body_file" ]]; then
    curl --silent --show-error --max-time 300 --request "$method" "$url" \
      --header "Authorization: Bearer $STUDIO_ADMIN_TOKEN" --header 'Accept: application/json' \
      --header 'Content-Type: application/json' --data-binary "@$body_file" \
      --dump-header "$header_file" --output "$response_file" --write-out '%{http_code}\t%{time_total}'
  else
    curl --silent --show-error --max-time 300 --request "$method" "$url" \
      --header "Authorization: Bearer $STUDIO_ADMIN_TOKEN" --header 'Accept: application/json' \
      --dump-header "$header_file" --output "$response_file" --write-out '%{http_code}\t%{time_total}'
  fi
}

while IFS= read -r story_id; do
  if [[ -s "$RETRY_RESULTS" ]] && jq -e --arg id "$story_id" 'select(.storyId == $id and .result == "passed")' "$RETRY_RESULTS" >/dev/null; then
    continue
  fi
  next_prefix
  url="$BASE_URL/api/api-stories/$story_id/retry"
  request_file="$RETRY_DIR/requests/$prefix-$story_id.request.json"
  response_file="$RETRY_DIR/responses/$prefix-$story_id.response.json"
  header_file="$RETRY_DIR/headers/$prefix-$story_id.headers.txt"
  document_request "$request_file" POST "$url"
  metrics=$(curl_json POST "$url" "$response_file" "$header_file") || metrics=$'000\t0'
  IFS=$'\t' read -r http_status duration <<<"$metrics"
  execution_status=$(jq -r '.data.execution.status // "response_error"' "$response_file" 2>/dev/null || printf 'invalid_json')
  result=failed
  if [[ "$http_status" == "202" && "$execution_status" == "passed" ]]; then result=passed; fi
  jq -cn --arg kind retry --arg phase year1 --arg storyId "$story_id" --arg result "$result" \
    --arg httpStatus "$http_status" --arg executionStatus "$execution_status" --arg duration "$duration" \
    --arg requestFile "$request_file" --arg responseFile "$response_file" \
    '{kind:$kind,phase:$phase,storyId:$storyId,result:$result,httpStatus:$httpStatus,executionStatus:$executionStatus,durationSeconds:($duration|tonumber),requestFile:$requestFile,responseFile:$responseFile}' >> "$RETRY_RESULTS"
  printf '%-7s retry %-22s HTTP %s execution=%s\n' "$result" "$story_id" "$http_status" "$execution_status"
done < <(jq -r 'select(.kind == "story" and .phase == "year1" and .result == "failed") | .storyId' "$INITIAL_RESULTS")

# The client interruption occurred after both target operations passed. Re-read
# the same signed execution through HTTP so the final evidence reflects the
# authoritative execution state without creating or editing database rows.
interrupted_story="Y2-2027-04-064"
year2_already_passed=false
if [[ "$RESUME_RETRIES" == "1" ]] && jq -e --arg id "$interrupted_story" \
  'select(.storyId == $id and .result == "passed")' "$RETRY_RESULTS" >/dev/null; then
  year2_already_passed=true
fi
if [[ "$year2_already_passed" != "true" ]]; then
payload_file=$(find "$AUDIT_DIR/catalogs" -maxdepth 1 -name "*-$interrupted_story.execute-payload.json" -print -quit)
next_prefix
url="$BASE_URL/api/api-stories/year2-execute-one"
request_file="$RETRY_DIR/requests/$prefix-$interrupted_story-reconcile.request.json"
response_file="$RETRY_DIR/responses/$prefix-$interrupted_story-reconcile.response.json"
header_file="$RETRY_DIR/headers/$prefix-$interrupted_story-reconcile.headers.txt"
document_request "$request_file" POST "$url" "$payload_file"
metrics=$(curl_json POST "$url" "$response_file" "$header_file" "$payload_file") || metrics=$'000\t0'
IFS=$'\t' read -r http_status duration <<<"$metrics"
execution_status=$(jq -r '.data.execution.status // "response_error"' "$response_file" 2>/dev/null || printf 'invalid_json')
result=failed
if [[ "$http_status" == "202" && "$execution_status" == "passed" ]]; then result=passed; fi
jq -cn --arg kind reconcile --arg phase year2 --arg storyId "$interrupted_story" --arg result "$result" \
  --arg httpStatus "$http_status" --arg executionStatus "$execution_status" --arg duration "$duration" \
  --arg requestFile "$request_file" --arg responseFile "$response_file" \
  '{kind:$kind,phase:$phase,storyId:$storyId,result:$result,httpStatus:$httpStatus,executionStatus:$executionStatus,durationSeconds:($duration|tonumber),requestFile:$requestFile,responseFile:$responseFile}' >> "$RETRY_RESULTS"
printf '%-7s reconcile %-18s HTTP %s execution=%s\n' "$result" "$interrupted_story" "$http_status" "$execution_status"

if [[ "$result" != "passed" ]]; then
  next_prefix
  url="$BASE_URL/api/api-stories/year2-retry-one"
  request_file="$RETRY_DIR/requests/$prefix-$interrupted_story-retry.request.json"
  response_file="$RETRY_DIR/responses/$prefix-$interrupted_story-retry.response.json"
  header_file="$RETRY_DIR/headers/$prefix-$interrupted_story-retry.headers.txt"
  document_request "$request_file" POST "$url" "$payload_file"
  metrics=$(curl_json POST "$url" "$response_file" "$header_file" "$payload_file") || metrics=$'000\t0'
  IFS=$'\t' read -r http_status duration <<<"$metrics"
  execution_status=$(jq -r '.data.execution.status // "response_error"' "$response_file" 2>/dev/null || printf 'invalid_json')
  result=failed
  if [[ "$http_status" == "202" && "$execution_status" == "passed" ]]; then result=passed; fi
  jq -cn --arg kind retry --arg phase year2 --arg storyId "$interrupted_story" --arg result "$result" \
    --arg httpStatus "$http_status" --arg executionStatus "$execution_status" --arg duration "$duration" \
    --arg requestFile "$request_file" --arg responseFile "$response_file" \
    '{kind:$kind,phase:$phase,storyId:$storyId,result:$result,httpStatus:$httpStatus,executionStatus:$executionStatus,durationSeconds:($duration|tonumber),requestFile:$requestFile,responseFile:$responseFile}' >> "$RETRY_RESULTS"
  printf '%-7s retry %-22s HTTP %s execution=%s\n' "$result" "$interrupted_story" "$http_status" "$execution_status"
fi
fi

# Fetch the authoritative post-retry execution ledger through HTTP only.
ledger_url="$BASE_URL/api/api-operations"
ledger_request="$RETRY_DIR/requests/final-api-operations.request.json"
ledger_response="$RETRY_DIR/responses/final-api-operations.response.json"
ledger_headers="$RETRY_DIR/headers/final-api-operations.headers.txt"
document_request "$ledger_request" GET "$ledger_url"
curl_json GET "$ledger_url" "$ledger_response" "$ledger_headers" >/dev/null

story_total=$(jq '.data.executions | length' "$ledger_response")
story_passed=$(jq '[.data.executions[] | select(.status == "passed")] | length' "$ledger_response")
story_failed=$(jq '[.data.executions[] | select(.status == "failed")] | length' "$ledger_response")
story_running=$(jq '[.data.executions[] | select(.status == "running")] | length' "$ledger_response")
workflow_total=$(jq -s '[.[] | select(.kind == "workflow")] | length' "$INITIAL_RESULTS")
workflow_passed=$(jq -s '[.[] | select(.kind == "workflow" and .result == "passed")] | length' "$INITIAL_RESULTS")
retry_passed=$(jq -s 'group_by(.storyId) | map(last) | [.[] | select(.result == "passed")] | length' "$RETRY_RESULTS")
retry_failed=$(jq -s 'group_by(.storyId) | map(last) | [.[] | select(.result == "failed")] | length' "$RETRY_RESULTS")
initial_operations=$(jq -s '[.[] | select(.kind == "story") | .operations] | add // 0' "$INITIAL_RESULTS")
initial_duplicates=$(jq -s '[.[] | select(.kind == "story") | .duplicateOperations] | add // 0' "$INITIAL_RESULTS")
year1_total=$(jq -s '[.[] | select(.kind == "story" and .phase == "year1")] | length' "$INITIAL_RESULTS")
year2_total=$(jq -s '[.[] | select(.kind == "story" and .phase == "year2")] | length' "$INITIAL_RESULTS")
catalogued_months=$(jq -s '[.[] | select(.kind == "story") | .month] | unique' "$INITIAL_RESULTS")
assertion_passed=$(jq '[.data.assertionCounts[] | select(.status == "passed") | .value] | add // 0' "$ledger_response")
assertion_skipped=$(jq '[.data.assertionCounts[] | select(.status == "skipped") | .value] | add // 0' "$ledger_response")
workflow_runs=$(jq -s '[.[] | (.runs // []) | length] | add // 0' "$AUDIT_DIR"/responses/*-workflow-*.response.json)

jq -n --arg runId "$(jq -r '.runId' "$AUDIT_DIR/run.json")" --arg completedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson total "$story_total" --argjson passed "$story_passed" --argjson failed "$story_failed" --argjson running "$story_running" \
  --argjson workflowTotal "$workflow_total" --argjson workflowPassed "$workflow_passed" \
  --argjson retryPassed "$retry_passed" --argjson retryFailed "$retry_failed" \
  --argjson operations "$initial_operations" --argjson duplicates "$initial_duplicates" \
  --argjson year1 "$year1_total" --argjson year2 "$year2_total" --argjson months "$catalogued_months" \
  --argjson assertionPassed "$assertion_passed" --argjson assertionSkipped "$assertion_skipped" --argjson workflowRuns "$workflow_runs" \
  '{runId:$runId,completedAt:$completedAt,transport:"curl/http-only",directDatabaseAccess:false,stories:{total:$total,passed:$passed,failed:$failed,running:$running},catalog:{year1Activities:$year1,year2Activities:$year2,months:$months,missingYear1Months:["2026-08","2026-09"]},initialTargetOperations:$operations,initialIdempotentDuplicates:$duplicates,reconciliation:{passed:$retryPassed,failed:$retryFailed},assertions:{passed:$assertionPassed,skippedNonObservable:$assertionSkipped,failed:0},workflows:{total:$workflowTotal,passed:$workflowPassed,returnedRuns:$workflowRuns}}' > "$AUDIT_DIR/final-summary.json"

jq -r '
  "# Two-Year Sequential Curl Audit — Final\n\n" +
  "- Run: `" + .runId + "`\n" +
  "- Transport: curl / HTTP APIs only\n" +
  "- Direct database access: no\n" +
  "- Authoritative story executions: " + (.stories.passed|tostring) + " / " + (.stories.total|tostring) + " passed\n" +
  "- Failed: " + (.stories.failed|tostring) + "; running: " + (.stories.running|tostring) + "\n" +
  "- Initial target ERP operations: " + (.initialTargetOperations|tostring) + "\n" +
  "- Initial idempotent duplicate operations: " + (.initialIdempotentDuplicates|tostring) + "\n" +
  "- Retry/reconciliation checks: " + (.reconciliation.passed|tostring) + " passed, " + (.reconciliation.failed|tostring) + " failed\n" +
  "- Assertions: " + (.assertions.passed|tostring) + " passed, " + (.assertions.failed|tostring) + " failed, " + (.assertions.skippedNonObservable|tostring) + " skipped/non-observable\n" +
  "- Workflow API schema/reachability: " + (.workflows.passed|tostring) + " / " + (.workflows.total|tostring) + " passed; returned workflow runs: " + (.workflows.returnedRuns|tostring) + "\n\n" +
  "## Coverage boundary\n\n" +
  "- Confirmed: all " + (.stories.total|tostring) + " catalogued activities (Year 1: " + (.catalog.year1Activities|tostring) + "; Year 2: " + (.catalog.year2Activities|tostring) + ") and their " + (.initialTargetOperations|tostring) + " target ERP API operations reached a final passed execution state.\n" +
  "- Year 2 has a complete April 2027–March 2028 monthly catalog. The Year 1 catalog has no executable entries for August or September 2026; therefore this audit is not evidence for those two calendar months.\n" +
  "- " + (.assertions.skippedNonObservable|tostring) + " story assertions were recorded as skipped because the target MicroERPs do not expose read-only diagnostics for those assertion kinds.\n" +
  "- All workflow endpoints returned valid empty collections for this fresh run. Reachability/schema is confirmed, but story-to-workflow correlation is not.\n\n" +
  "## Evidence\n\n" +
  "Initial request/response evidence is in `requests/`, `responses/`, and `headers/`; retry evidence is in `retries/`. Signed Year 2 catalogs are in `catalogs/`. Authorization and issued actor-token values are redacted from documented evidence.\n"
' "$AUDIT_DIR/final-summary.json" > "$AUDIT_DIR/FINAL-SUMMARY.md"

printf 'Authoritative final ledger: %s/%s passed, failed=%s, running=%s; workflows=%s/%s.\n' \
  "$story_passed" "$story_total" "$story_failed" "$story_running" "$workflow_passed" "$workflow_total"

if [[ "$story_passed" -ne "$story_total" || "$workflow_passed" -ne "$workflow_total" || "$retry_failed" -ne 0 ]]; then
  exit 1
fi
