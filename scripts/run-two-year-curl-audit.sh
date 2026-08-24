#!/usr/bin/env bash
set -uo pipefail

BASE_URL="${BASE_URL:-https://simulation.erp.appneural.com}"
GATEWAY_URL="${GATEWAY_URL:-https://api.erp.appneural.com}"
AUDIT_STAMP="${AUDIT_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
AUDIT_DIR="${1:-audit/two-year-curl-$AUDIT_STAMP}"

if [[ -z "${STUDIO_ADMIN_TOKEN:-}" ]]; then
  printf 'STUDIO_ADMIN_TOKEN is required.\n' >&2
  exit 2
fi
for command_name in curl jq; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf '%s is required.\n' "$command_name" >&2
    exit 2
  fi
done

mkdir -p "$AUDIT_DIR/requests" "$AUDIT_DIR/responses" "$AUDIT_DIR/headers" "$AUDIT_DIR/catalogs"
RESULTS_FILE="$AUDIT_DIR/results.ndjson"
RUN_FILE="$AUDIT_DIR/run.json"
: > "$RESULTS_FILE"

sequence=0
story_failures=0
workflow_failures=0

safe_name() {
  printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_'
}

next_prefix() {
  sequence=$((sequence + 1))
  prefix=$(printf '%04d' "$sequence")
}

write_request() {
  local destination="$1"
  local method="$2"
  local url="$3"
  local body_file="${4:-}"
  if [[ -n "$body_file" ]]; then
    jq -n --arg method "$method" --arg url "$url" --slurpfile body "$body_file" \
      '{method:$method,url:$url,headers:{authorization:"Bearer <REDACTED>",accept:"application/json","content-type":"application/json"},body:$body[0]}' > "$destination"
  else
    jq -n --arg method "$method" --arg url "$url" \
      '{method:$method,url:$url,headers:{authorization:"Bearer <REDACTED>",accept:"application/json"},body:null}' > "$destination"
  fi
}

curl_json() {
  local method="$1"
  local url="$2"
  local response_file="$3"
  local header_file="$4"
  local body_file="${5:-}"
  local metrics
  if [[ -n "$body_file" ]]; then
    metrics=$(curl --silent --show-error --max-time 300 \
      --request "$method" "$url" \
      --header "Authorization: Bearer $STUDIO_ADMIN_TOKEN" \
      --header 'Accept: application/json' \
      --header 'Content-Type: application/json' \
      --data-binary "@$body_file" \
      --dump-header "$header_file" \
      --output "$response_file" \
      --write-out '%{http_code}\t%{time_total}') || metrics="000\t0"
  else
    metrics=$(curl --silent --show-error --max-time 300 \
      --request "$method" "$url" \
      --header "Authorization: Bearer $STUDIO_ADMIN_TOKEN" \
      --header 'Accept: application/json' \
      --dump-header "$header_file" \
      --output "$response_file" \
      --write-out '%{http_code}\t%{time_total}') || metrics="000\t0"
  fi
  printf '%b' "$metrics"
}

record_story_result() {
  local phase="$1"
  local story_id="$2"
  local month="$3"
  local module="$4"
  local http_status="$5"
  local duration="$6"
  local request_file="$7"
  local response_file="$8"
  local execution_status operation_count failed_operations duplicate_operations failed_assertions skipped_assertions
  execution_status=$(jq -r '.data.execution.status // "response_error"' "$response_file" 2>/dev/null || printf 'invalid_json')
  operation_count=$(jq '[.data.operations[]?] | length' "$response_file" 2>/dev/null || printf '0')
  failed_operations=$(jq '[.data.operations[]? | select(.status == "failed")] | length' "$response_file" 2>/dev/null || printf '0')
  duplicate_operations=$(jq '[.data.operations[]? | select((.actual_status == 409 or .actual_status == 422) and .status == "passed")] | length' "$response_file" 2>/dev/null || printf '0')
  failed_assertions=$(jq '[.data.assertions[]? | select(.status == "failed")] | length' "$response_file" 2>/dev/null || printf '0')
  skipped_assertions=$(jq '[.data.assertions[]? | select(.status == "skipped")] | length' "$response_file" 2>/dev/null || printf '0')
  local result="passed"
  if [[ "$http_status" != "202" || "$execution_status" != "passed" || "$failed_operations" != "0" || "$failed_assertions" != "0" ]]; then
    result="failed"
    story_failures=$((story_failures + 1))
  fi
  jq -cn \
    --arg kind story --arg phase "$phase" --arg storyId "$story_id" --arg month "$month" --arg module "$module" \
    --arg result "$result" --arg executionStatus "$execution_status" --arg httpStatus "$http_status" \
    --arg durationSeconds "$duration" --arg request "$request_file" --arg response "$response_file" \
    --argjson operations "$operation_count" --argjson failedOperations "$failed_operations" \
    --argjson duplicateOperations "$duplicate_operations" --argjson failedAssertions "$failed_assertions" \
    --argjson skippedAssertions "$skipped_assertions" \
    '{kind:$kind,phase:$phase,storyId:$storyId,month:$month,module:$module,result:$result,executionStatus:$executionStatus,httpStatus:$httpStatus,durationSeconds:($durationSeconds|tonumber),operations:$operations,failedOperations:$failedOperations,duplicateOperations:$duplicateOperations,failedAssertions:$failedAssertions,skippedAssertions:$skippedAssertions,requestFile:$request,responseFile:$response}' \
    >> "$RESULTS_FILE"
  printf '%-7s %-22s %-14s HTTP %s ops=%s duplicates=%s\n' "$result" "$story_id" "$module" "$http_status" "$operation_count" "$duplicate_operations"
}

printf 'Audit directory: %s\n' "$AUDIT_DIR"

# Create a fresh run only through the public API, then pause the simulation clock.
run_payload="$AUDIT_DIR/run-create-payload.json"
jq -n --arg seed "curl-sequential-$AUDIT_STAMP" \
  '{mode:"replay",speed:1,companyTime:"2026-02-01T08:00:00+05:30",seed:$seed}' > "$run_payload"
next_prefix
run_prefix="$prefix"
run_request="$AUDIT_DIR/requests/$run_prefix-create-run.request.json"
run_response="$AUDIT_DIR/responses/$run_prefix-create-run.response.json"
run_headers="$AUDIT_DIR/headers/$run_prefix-create-run.headers.txt"
write_request "$run_request" POST "$BASE_URL/api/runs" "$run_payload"
IFS=$'\t' read -r run_http run_duration < <(curl_json POST "$BASE_URL/api/runs" "$run_response" "$run_headers" "$run_payload")
if [[ "$run_http" != "201" ]]; then
  printf 'Fresh run creation failed with HTTP %s.\n' "$run_http" >&2
  exit 1
fi
run_id=$(jq -r '.data.run.id // empty' "$run_response")
if [[ -z "$run_id" ]]; then
  printf 'Run response did not contain a run id.\n' >&2
  exit 1
fi
jq -n --arg runId "$run_id" --arg startedAt "$AUDIT_STAMP" --arg baseUrl "$BASE_URL" --arg gatewayUrl "$GATEWAY_URL" \
  '{runId:$runId,startedAt:$startedAt,transport:"curl/http-only",directDatabaseAccess:false,baseUrl:$baseUrl,gatewayUrl:$gatewayUrl}' > "$RUN_FILE"

pause_payload="$AUDIT_DIR/run-pause-payload.json"
jq -n '{action:"pause"}' > "$pause_payload"
next_prefix
pause_prefix="$prefix"
pause_request="$AUDIT_DIR/requests/$pause_prefix-pause-run.request.json"
pause_response="$AUDIT_DIR/responses/$pause_prefix-pause-run.response.json"
pause_headers="$AUDIT_DIR/headers/$pause_prefix-pause-run.headers.txt"
write_request "$pause_request" POST "$BASE_URL/api/control" "$pause_payload"
curl_json POST "$BASE_URL/api/control" "$pause_response" "$pause_headers" "$pause_payload" >/dev/null

# Freeze the static Year 1 catalog, then execute every story sequentially.
year1_catalog="$AUDIT_DIR/catalogs/year1-catalog.json"
year1_catalog_headers="$AUDIT_DIR/headers/year1-catalog.headers.txt"
curl_json GET "$BASE_URL/api/api-stories" "$year1_catalog" "$year1_catalog_headers" >/dev/null
year1_total=$(jq '.data.stories | length' "$year1_catalog")
printf 'Year 1 catalog: %s stories\n' "$year1_total"

while IFS= read -r story; do
  story_id=$(jq -r '.id' <<<"$story")
  month=$(jq -r '.month' <<<"$story")
  module=$(jq -r '.module' <<<"$story")
  safe_story=$(safe_name "$story_id")
  next_prefix
  request_file="$AUDIT_DIR/requests/$prefix-$safe_story.request.json"
  response_file="$AUDIT_DIR/responses/$prefix-$safe_story.response.json"
  header_file="$AUDIT_DIR/headers/$prefix-$safe_story.headers.txt"
  url="$BASE_URL/api/api-stories/$(jq -rn --arg value "$story_id" '$value|@uri')/execute"
  story_file="$AUDIT_DIR/catalogs/$prefix-$safe_story.story.json"
  printf '%s\n' "$story" | jq . > "$story_file"
  jq -n --arg method POST --arg url "$url" --arg storyFile "$story_file" --slurpfile story "$story_file" \
    '{method:$method,url:$url,headers:{authorization:"Bearer <REDACTED>",accept:"application/json"},body:null,story:$story[0],storyCatalogFile:$storyFile}' > "$request_file"
  IFS=$'\t' read -r http_status duration < <(curl_json POST "$url" "$response_file" "$header_file")
  record_story_result year1 "$story_id" "$month" "$module" "$http_status" "$duration" "$request_file" "$response_file"
done < <(jq -c '.data.stories | sort_by(.companyTime,.id)[]' "$year1_catalog")

# For each quarter, freeze all three signed month catalogs before executing them one by one.
year2_months=(2027-04 2027-05 2027-06 2027-07 2027-08 2027-09 2027-10 2027-11 2027-12 2028-01 2028-02 2028-03)
for quarter_start in 0 3 6 9; do
  quarter_catalogs=()
  for offset in 0 1 2; do
    month="${year2_months[$((quarter_start + offset))]}"
    catalog_file="$AUDIT_DIR/catalogs/year2-$month-catalog.json"
    catalog_headers="$AUDIT_DIR/headers/year2-$month-catalog.headers.txt"
    curl_json GET "$BASE_URL/api/api-stories/year2-catalog?month=$month" "$catalog_file" "$catalog_headers" >/dev/null
    if ! jq -e '.data.stories | type == "array"' "$catalog_file" >/dev/null; then
      printf 'Year 2 catalog failed for %s.\n' "$month" >&2
      exit 1
    fi
    quarter_catalogs+=("$catalog_file")
    printf 'Year 2 catalog %s: %s stories\n' "$month" "$(jq '.data.stories | length' "$catalog_file")"
  done
  for catalog_file in "${quarter_catalogs[@]}"; do
    while IFS= read -r signed_story; do
      story_id=$(jq -r '.story.id' <<<"$signed_story")
      month=$(jq -r '.story.month' <<<"$signed_story")
      module=$(jq -r '.story.module' <<<"$signed_story")
      safe_story=$(safe_name "$story_id")
      next_prefix
      payload_file="$AUDIT_DIR/catalogs/$prefix-$safe_story.execute-payload.json"
      printf '%s\n' "$signed_story" | jq . > "$payload_file"
      request_file="$AUDIT_DIR/requests/$prefix-$safe_story.request.json"
      response_file="$AUDIT_DIR/responses/$prefix-$safe_story.response.json"
      header_file="$AUDIT_DIR/headers/$prefix-$safe_story.headers.txt"
      url="$BASE_URL/api/api-stories/year2-execute-one"
      write_request "$request_file" POST "$url" "$payload_file"
      IFS=$'\t' read -r http_status duration < <(curl_json POST "$url" "$response_file" "$header_file" "$payload_file")
      record_story_result year2 "$story_id" "$month" "$module" "$http_status" "$duration" "$request_file" "$response_file"
    done < <(jq -c '.data.stories[]' "$catalog_file")
  done
done

# Obtain a short-lived actor token via HTTP and verify all 30 workflow read APIs.
actor_payload="$AUDIT_DIR/actor-token-payload.json"
jq -n '{actorId:"EMP-1001"}' > "$actor_payload"
actor_raw=$(mktemp /tmp/two-year-actor-token.XXXXXX.json)
trap 'rm -f "$actor_raw"' EXIT
actor_headers="$AUDIT_DIR/headers/actor-token.headers.txt"
curl_json POST "$BASE_URL/api/auth/simulation/token" "$actor_raw" "$actor_headers" "$actor_payload" >/dev/null
actor_token=$(jq -r '.data.token // empty' "$actor_raw")
jq 'if .data.token then .data.token = "<REDACTED>" else . end' "$actor_raw" > "$AUDIT_DIR/responses/actor-token.response.json"
if [[ -z "$actor_token" ]]; then
  printf 'Actor token issuance failed.\n' >&2
  exit 1
fi

workflow_modules=(administration asset attendance audit billing compliance contract crm customer devops expense finance hr inventory learning legal organization payroll performance presales procurement project qa recruitment resource risk sdlc security support vendor)
for module in "${workflow_modules[@]}"; do
  next_prefix
  request_file="$AUDIT_DIR/requests/$prefix-workflow-$module.request.json"
  response_file="$AUDIT_DIR/responses/$prefix-workflow-$module.response.json"
  header_file="$AUDIT_DIR/headers/$prefix-workflow-$module.headers.txt"
  url="$GATEWAY_URL/$module/api/workflow-runs"
  correlation="curl-audit-$run_id-$module"
  jq -n --arg url "$url" --arg runId "$run_id" --arg correlation "$correlation" \
    '{method:"GET",url:$url,headers:{authorization:"Bearer <REDACTED-SIMULATION-TOKEN>",accept:"application/json","x-simulation-run":$runId,"x-simulation-time":"2028-03-31T17:00:00+05:30","x-correlation-id":$correlation,"x-idempotency-key":$correlation},body:null}' > "$request_file"
  metrics=$(curl --silent --show-error --max-time 120 \
    "$url" \
    --header "Authorization: Bearer $actor_token" \
    --header 'Accept: application/json' \
    --header "X-Simulation-Run: $run_id" \
    --header 'X-Simulation-Time: 2028-03-31T17:00:00+05:30' \
    --header "X-Correlation-Id: $correlation" \
    --header "X-Idempotency-Key: $correlation" \
    --dump-header "$header_file" --output "$response_file" --write-out '%{http_code}\t%{time_total}') || metrics="000\t0"
  IFS=$'\t' read -r http_status duration <<<"$metrics"
  result="passed"
  if [[ "$http_status" != "200" ]] || ! jq -e --arg module "$module" '.erpSlug == $module and (.runs | type == "array")' "$response_file" >/dev/null 2>&1; then
    result="failed"
    workflow_failures=$((workflow_failures + 1))
  fi
  run_count=$(jq '.runs | length' "$response_file" 2>/dev/null || printf '0')
  jq -cn --arg kind workflow --arg module "$module" --arg result "$result" --arg httpStatus "$http_status" \
    --arg durationSeconds "$duration" --arg request "$request_file" --arg response "$response_file" --argjson runs "$run_count" \
    '{kind:$kind,module:$module,result:$result,httpStatus:$httpStatus,durationSeconds:($durationSeconds|tonumber),workflowRuns:$runs,requestFile:$request,responseFile:$response}' >> "$RESULTS_FILE"
  printf '%-7s workflow %-18s HTTP %s runs=%s\n' "$result" "$module" "$http_status" "$run_count"
done

# Final ledger is fetched through the API; no direct database query is used.
ledger_request="$AUDIT_DIR/requests/final-api-operations.request.json"
ledger_response="$AUDIT_DIR/responses/final-api-operations.response.json"
ledger_headers="$AUDIT_DIR/headers/final-api-operations.headers.txt"
write_request "$ledger_request" GET "$BASE_URL/api/api-operations"
curl_json GET "$BASE_URL/api/api-operations" "$ledger_response" "$ledger_headers" >/dev/null

story_total=$(jq -s '[.[] | select(.kind == "story")] | length' "$RESULTS_FILE")
story_passed=$(jq -s '[.[] | select(.kind == "story" and .result == "passed")] | length' "$RESULTS_FILE")
story_failed=$(jq -s '[.[] | select(.kind == "story" and .result == "failed")] | length' "$RESULTS_FILE")
year1_passed=$(jq -s '[.[] | select(.kind == "story" and .phase == "year1" and .result == "passed")] | length' "$RESULTS_FILE")
year2_passed=$(jq -s '[.[] | select(.kind == "story" and .phase == "year2" and .result == "passed")] | length' "$RESULTS_FILE")
operations=$(jq -s '[.[] | select(.kind == "story") | .operations] | add // 0' "$RESULTS_FILE")
duplicates=$(jq -s '[.[] | select(.kind == "story") | .duplicateOperations] | add // 0' "$RESULTS_FILE")
skipped=$(jq -s '[.[] | select(.kind == "story") | .skippedAssertions] | add // 0' "$RESULTS_FILE")
workflow_passed=$(jq -s '[.[] | select(.kind == "workflow" and .result == "passed")] | length' "$RESULTS_FILE")

jq -s '.' "$RESULTS_FILE" > "$AUDIT_DIR/results.json"
jq -n --arg runId "$run_id" --arg completedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson storyTotal "$story_total" --argjson storyPassed "$story_passed" --argjson storyFailed "$story_failed" \
  --argjson year1Passed "$year1_passed" --argjson year2Passed "$year2_passed" --argjson operations "$operations" \
  --argjson duplicateOperations "$duplicates" --argjson skippedAssertions "$skipped" \
  --argjson workflowPassed "$workflow_passed" --argjson workflowFailed "$workflow_failures" \
  '{runId:$runId,completedAt:$completedAt,transport:"curl/http-only",directDatabaseAccess:false,stories:{total:$storyTotal,passed:$storyPassed,failed:$storyFailed,year1Passed:$year1Passed,year2Passed:$year2Passed},operations:$operations,idempotentDuplicateOperations:$duplicateOperations,skippedNonObservableAssertions:$skipped,workflows:{passed:$workflowPassed,failed:$workflowFailed}}' > "$AUDIT_DIR/summary.json"

jq -r '
  "# Two-Year Sequential Curl Audit\n\n" +
  "- Run: `" + .runId + "`\n" +
  "- Transport: curl / HTTP APIs only\n" +
  "- Direct database access: no\n" +
  "- Stories: " + (.stories.passed|tostring) + " / " + (.stories.total|tostring) + " passed (" + (.stories.failed|tostring) + " failed)\n" +
  "- Year 1 passed: " + (.stories.year1Passed|tostring) + "\n" +
  "- Year 2 passed: " + (.stories.year2Passed|tostring) + "\n" +
  "- Target ERP operations observed: " + (.operations|tostring) + "\n" +
  "- Idempotent duplicate operations: " + (.idempotentDuplicateOperations|tostring) + "\n" +
  "- Workflow APIs: " + (.workflows.passed|tostring) + " / " + ((.workflows.passed + .workflows.failed)|tostring) + " passed (" + (.workflows.failed|tostring) + " failed)\n" +
  "- Non-observable assertions skipped by the application: " + (.skippedNonObservableAssertions|tostring) + "\n\n" +
  "Every outer request is under `requests/`, response body under `responses/`, response headers under `headers/`, and the signed catalogs under `catalogs/`. Authorization values are redacted from documented requests.\n"
' "$AUDIT_DIR/summary.json" > "$AUDIT_DIR/SUMMARY.md"

printf 'Completed: stories %s/%s passed; workflows %s/%s passed.\n' "$story_passed" "$story_total" "$workflow_passed" "${#workflow_modules[@]}"
printf 'Evidence: %s\n' "$AUDIT_DIR"

if [[ "$story_failures" -ne 0 || "$workflow_failures" -ne 0 ]]; then
  exit 1
fi
