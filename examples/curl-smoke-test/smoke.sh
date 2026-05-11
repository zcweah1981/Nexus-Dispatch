#!/usr/bin/env bash
# R34_CURL_SMOKE_EXAMPLE_CONTRACT
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:8000/api/v1}"
API_AUTH_TOKEN="${API_AUTH_TOKEN:-YOUR_RUNTIME_TOKEN}"
PROJECT_ID="${PROJECT_ID:-nexus-dispatch-smoke}"
AGENT_ID="${AGENT_ID:-long-coder-smoke}"
TASK_ID="${TASK_ID:-curl-smoke-first-task}"
RUN_TRANSITIONS="${RUN_TRANSITIONS:-0}"

if [[ "${API_AUTH_TOKEN}" == "YOUR_RUNTIME_TOKEN" ]]; then
  cat >&2 <<'MSG'
ERROR: set API_AUTH_TOKEN before running this smoke test.
Example:
  API_AUTH_TOKEN="your-dev-token" ./examples/curl-smoke-test/smoke.sh
MSG
  exit 2
fi

request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  if [[ -n "${body}" ]]; then
    curl -sS -X "${method}" "${API_BASE_URL}${path}" \
      -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${body}"
  else
    curl -sS -X "${method}" "${API_BASE_URL}${path}" \
      -H "Authorization: Bearer ${API_AUTH_TOKEN}"
  fi
}

printf '[1/5] create or update project: %s\n' "${PROJECT_ID}"
request POST "/runtime/projects" "$(cat <<JSON
{"id":"${PROJECT_ID}","name":"${PROJECT_ID}","status":"active","pm_soul_prompt":"R34 curl smoke project."}
JSON
)"
printf '\n\n'

printf '[2/5] register worker agent: %s\n' "${AGENT_ID}"
request POST "/runtime/projects/${PROJECT_ID}/agents" "$(cat <<JSON
{"agent_id":"${AGENT_ID}","endpoint":"http://127.0.0.1:8647/v1/runs","lane":"DEV","dialect":"openclaw","soul_prompt":"Execute smoke tasks and return structured proof.","tools_allowed":["terminal","file"],"status":"online"}
JSON
)"
printf '\n\n'

printf '[3/5] create task: %s\n' "${TASK_ID}"
request POST "/runtime/tasks" "$(cat <<JSON
{"project_id":"${PROJECT_ID}","id":"${TASK_ID}","title":"Curl smoke task","objective":"Verify Runtime API project, agent, task, and query endpoints with curl.","lane_required":"DEV","acceptance_mode":"group_only","acceptance_criteria":["Runtime API creates the task","Pending query can see the task"]}
JSON
)"
printf '\n\n'

printf '[4/5] query pending DEV tasks\n'
request GET "/runtime/tasks/pending?project_id=${PROJECT_ID}&lane=DEV"
printf '\n\n'

printf '[5/5] fetch created task\n'
request GET "/runtime/tasks/${TASK_ID}?project_id=${PROJECT_ID}"
printf '\n\n'

if [[ "${RUN_TRANSITIONS}" == "1" ]]; then
  printf '[optional] drive implemented FSM transitions through Runtime API\n'
  for event in dispatch start submit_completion request_review review_pass; do
    printf 'transition: %s\n' "${event}"
    request POST "/runtime/tasks/transition" "$(cat <<JSON
{"project_id":"${PROJECT_ID}","task_id":"${TASK_ID}","event":"${event}","proof":{"source":"examples/curl-smoke-test","note":"manual smoke transition against implemented Runtime API"}}
JSON
)"
    printf '\n'
  done
  printf '\n[optional] final task state\n'
  request GET "/runtime/tasks/${TASK_ID}?project_id=${PROJECT_ID}"
  printf '\n'
else
  cat <<MSG
Smoke finished without forcing completion.
Set RUN_TRANSITIONS=1 only when you intentionally want to exercise the implemented FSM transition endpoint.
MSG
fi
