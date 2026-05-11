#!/usr/bin/env bash
# R34_MOCK_WORKER_EXAMPLE_CONTRACT
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_BASE_URL="${API_BASE_URL:-http://localhost:8000/api/v1}"
API_AUTH_TOKEN="${API_AUTH_TOKEN:-YOUR_RUNTIME_TOKEN}"
PROJECT_ID="${PROJECT_ID:-nexus-dispatch-mock-worker-smoke}"
AGENT_ID="${AGENT_ID:-mock-worker-local}"
TASK_ID="${TASK_ID:-mock-worker-first-task}"
MOCK_WORKER_PORT="${MOCK_WORKER_PORT:-18647}"
RUN_API_PROOF="${RUN_API_PROOF:-0}"
WORKER_RUN_ID="${WORKER_RUN_ID:-mock-worker-manual-proof}"

if [[ "${API_AUTH_TOKEN}" == "YOUR_RUNTIME_TOKEN" && "${RUN_API_PROOF}" == "1" ]]; then
  cat >&2 <<'MSG'
ERROR: RUN_API_PROOF=1 calls the Runtime API, so API_AUTH_TOKEN must be set.
Example:
  API_AUTH_TOKEN="YOUR_LOCAL_TOKEN" RUN_API_PROOF=1 ./examples/mock-worker/smoke.sh
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

if [[ "${1:-}" == "worker-only" ]]; then
  printf '[worker-only] POST OpenAI-compatible dispatch payload to local mock worker\n'
  node "${SCRIPT_DIR}/mock-worker.js" > /tmp/nexus-mock-worker.log 2>&1 &
  worker_pid="$!"
  trap 'kill "${worker_pid}" >/dev/null 2>&1 || true' EXIT
  for _ in 1 2 3 4 5; do
    if curl -sS "http://127.0.0.1:${MOCK_WORKER_PORT}/health" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done
  curl -sS -X POST "http://127.0.0.1:${MOCK_WORKER_PORT}/v1/runs" \
    -H "Content-Type: application/json" \
    -d "$(cat <<JSON
{"model":"mock-worker","messages":[{"role":"system","content":"You are a Nexus Dispatch worker."},{"role":"user","content":"{\"project_id\":\"${PROJECT_ID}\",\"task\":{\"id\":\"${TASK_ID}\",\"title\":\"Mock worker smoke\",\"objective\":\"Receive and acknowledge one task.\",\"lane_required\":\"DEV\",\"acceptance_mode\":\"group_only\",\"reviewer\":null},\"agent\":{\"agent_id\":\"${AGENT_ID}\",\"endpoint\":\"http://127.0.0.1:${MOCK_WORKER_PORT}/v1/runs\",\"lane\":\"DEV\",\"dialect\":\"mock-worker\"},\"run_id\":\"local-run-1\",\"lease\":{\"lease_token\":\"local-lease\",\"lease_ttl_ms\":900000,\"lease_expires_at\":\"2099-01-01T00:00:00.000Z\"}}"}],"metadata":{"project_id":"${PROJECT_ID}","task_id":"${TASK_ID}","run_id":"local-run-1","agent_id":"${AGENT_ID}","lease_token":"local-lease"}}
JSON
)"
  printf '\n'
  exit 0
fi

printf '[1/7] start local mock worker endpoint\n'
node "${SCRIPT_DIR}/mock-worker.js" > /tmp/nexus-mock-worker.log 2>&1 &
worker_pid="$!"
trap 'kill "${worker_pid}" >/dev/null 2>&1 || true' EXIT
for _ in 1 2 3 4 5; do
  if curl -sS "http://127.0.0.1:${MOCK_WORKER_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done
printf 'mock worker: http://127.0.0.1:%s/v1/runs\n\n' "${MOCK_WORKER_PORT}"

printf '[2/7] create or update project: %s\n' "${PROJECT_ID}"
request POST "/runtime/projects" "$(cat <<JSON
{"id":"${PROJECT_ID}","name":"${PROJECT_ID}","status":"active","pm_soul_prompt":"R34 mock worker integration smoke project."}
JSON
)"
printf '\n\n'

printf '[3/7] register mock worker agent: %s\n' "${AGENT_ID}"
request POST "/runtime/projects/${PROJECT_ID}/agents" "$(cat <<JSON
{"agent_id":"${AGENT_ID}","endpoint":"http://127.0.0.1:${MOCK_WORKER_PORT}/v1/runs","lane":"DEV","dialect":"mock-worker","soul_prompt":"Receive one smoke dispatch and return structured worker_run_id proof.","tools_allowed":["http"],"status":"online"}
JSON
)"
printf '\n\n'

printf '[4/7] create task for mock worker contract smoke: %s\n' "${TASK_ID}"
request POST "/runtime/tasks" "$(cat <<JSON
{"project_id":"${PROJECT_ID}","id":"${TASK_ID}","title":"Mock worker integration smoke","objective":"Demonstrate the worker endpoint contract without Telegram or private agents.","lane_required":"DEV","acceptance_mode":"group_only","acceptance_criteria":["Mock worker endpoint receives a dispatch-shaped payload","Runtime API can store run and artifact proof when RUN_API_PROOF=1"]}
JSON
)"
printf '\n\n'

printf '[5/7] direct worker contract call: POST /v1/runs\n'
curl -sS -X POST "http://127.0.0.1:${MOCK_WORKER_PORT}/v1/runs" \
  -H "Content-Type: application/json" \
  -d "$(cat <<JSON
{"model":"mock-worker","messages":[{"role":"system","content":"You are a Nexus Dispatch worker."},{"role":"user","content":"{\"project_id\":\"${PROJECT_ID}\",\"task\":{\"id\":\"${TASK_ID}\",\"title\":\"Mock worker integration smoke\",\"objective\":\"Demonstrate worker contract.\",\"lane_required\":\"DEV\",\"acceptance_mode\":\"group_only\",\"reviewer\":null},\"agent\":{\"agent_id\":\"${AGENT_ID}\",\"endpoint\":\"http://127.0.0.1:${MOCK_WORKER_PORT}/v1/runs\",\"lane\":\"DEV\",\"dialect\":\"mock-worker\"},\"run_id\":\"local-runtime-run\",\"lease\":{\"lease_token\":\"local-lease\",\"lease_ttl_ms\":900000,\"lease_expires_at\":\"2099-01-01T00:00:00.000Z\"}}"}],"metadata":{"project_id":"${PROJECT_ID}","task_id":"${TASK_ID}","run_id":"local-runtime-run","agent_id":"${AGENT_ID}","lease_token":"local-lease"}}
JSON
)"
printf '\n\n'

printf '[6/7] pending DEV tasks still visible through Runtime API\n'
request GET "/runtime/tasks/pending?project_id=${PROJECT_ID}&lane=DEV"
printf '\n\n'

if [[ "${RUN_API_PROOF}" == "1" ]]; then
  printf '[7/7] write smoke run/artifact/transition proof through Runtime API\n'
  request POST "/runtime/runs" "$(cat <<JSON
{"project_id":"${PROJECT_ID}","run_id":"mock-worker-runtime-run","task_id":"${TASK_ID}","agent_id":"${AGENT_ID}","worker_run_id":"${WORKER_RUN_ID}","status":"running","idempotency_key":"${PROJECT_ID}:${TASK_ID}:${AGENT_ID}:mock-worker-example"}
JSON
)"
  printf '\n'
  request POST "/runtime/artifacts" "$(cat <<JSON
{"project_id":"${PROJECT_ID}","run_id":"mock-worker-runtime-run","task_id":"${TASK_ID}","artifact_type":"worker_contract_smoke","path":"examples/mock-worker","payload":{"summary":"Mock worker received a dispatch-shaped request and returned worker_run_id.","worker_run_id":"${WORKER_RUN_ID}","private_dependencies":false}}
JSON
)"
  printf '\n'
  for event in dispatch start submit_completion; do
    request POST "/runtime/tasks/transition" "$(cat <<JSON
{"project_id":"${PROJECT_ID}","task_id":"${TASK_ID}","event":"${event}","proof":{"source":"examples/mock-worker","worker_run_id":"${WORKER_RUN_ID}","smoke_only":true}}
JSON
)"
    printf '\n'
  done
else
  cat <<MSG
[7/7] smoke-only path complete.
RUN_API_PROOF is not enabled, so no completion or proof transition was forced.
Set RUN_API_PROOF=1 with a real API_AUTH_TOKEN only for a local Runtime API proof write.
MSG
fi
