#!/usr/bin/env bash
# Nexus Dispatch System — deployment health/smoke check
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

API_PORT="${NEXUS_API_PORT:-${PORT:-8000}}"
WEBUI_PORT="${NEXUS_WEBUI_PORT:-3030}"
PROJECT_ID="${NEXUS_PROJECT_ID:-${PROJECT_ID:-nexus-dispatch}}"
API_TOKEN="${PM_API_TOKEN:-${API_AUTH_TOKEN:-}}"
QUICK_MODE=false
JSON_OUTPUT=false
CRITICALS=0
WARNINGS=0
CHECKS_TOTAL=0
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
declare -a RESULTS=()

for arg in "$@"; do
  case "$arg" in
    --quick) QUICK_MODE=true ;;
    --json) JSON_OUTPUT=true ;;
    --help|-h)
      echo "Usage: $0 [--quick] [--json]"
      exit 0
      ;;
  esac
done

section() { RESULTS+=(""); RESULTS+=("═══ $1 ═══"); }
result() {
  local level="$1" name="$2" status="$3" detail="$4"
  CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
  case "$level" in
    CRITICAL) CRITICALS=$((CRITICALS + 1)); RESULTS+=("[CRITICAL] $name: $status — $detail") ;;
    WARNING) WARNINGS=$((WARNINGS + 1)); RESULTS+=("[WARNING] $name: $status — $detail") ;;
    *) RESULTS+=("[OK] $name: $status — $detail") ;;
  esac
}

check_compose() {
  section "Docker Compose"
  if ! command -v docker >/dev/null 2>&1; then
    result WARNING docker not-installed "skip compose checks"
    return
  fi
  if ! docker compose version >/dev/null 2>&1; then
    result WARNING docker-compose not-available "docker compose plugin missing"
    return
  fi
  result OK docker-compose available "$(docker compose version --short 2>/dev/null || echo unknown)"
  for svc in nexus-api nexus-daemon nexus-webui; do
    cid=$(docker compose ps -q "$svc" 2>/dev/null || true)
    if [ -z "$cid" ]; then
      result WARNING "$svc" not-running "container not found; systemd/local deployment may be in use"
      continue
    fi
    state=$(docker inspect --format='{{.State.Status}}' "$cid" 2>/dev/null || echo unknown)
    health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$cid" 2>/dev/null || echo unknown)
    if [ "$state" = running ]; then
      result OK "$svc" running "health=$health"
    else
      result CRITICAL "$svc" "$state" "container is not running"
    fi
  done
}

check_systemd() {
  section "systemd"
  if ! command -v systemctl >/dev/null 2>&1; then
    result OK systemd not-applicable "systemctl not present"
    return
  fi
  for unit in nexus-dispatch-api.service nexus-dispatch-daemon.service; do
    if ! systemctl list-unit-files "$unit" >/dev/null 2>&1; then
      result OK "$unit" not-installed "unit not present"
      continue
    fi
    active=$(systemctl is-active "$unit" 2>/dev/null || echo inactive)
    if [ "$active" = active ]; then
      result OK "$unit" active "running"
    else
      result WARNING "$unit" "$active" "not active"
    fi
  done
}

check_api() {
  section "API Runtime"
  unauth_code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:${API_PORT}/api/v1/runtime/tasks/pending?project_id=${PROJECT_ID}" 2>/dev/null || echo 000)
  if [ "$unauth_code" = 401 ]; then
    result OK api-auth-guard 401 "unauthenticated /api/v1 rejected"
  elif [ "$unauth_code" = 000 ]; then
    result CRITICAL api-port unreachable "cannot connect to 127.0.0.1:${API_PORT}"
  else
    result WARNING api-auth-guard "$unauth_code" "expected 401 without Bearer token"
  fi

  if [ -n "$API_TOKEN" ]; then
    auth_code=$(curl -sS -o /tmp/nexus-dispatch-health-api.json -w "%{http_code}" --max-time 5 \
      -H "Authorization: Bearer ${API_TOKEN}" \
      "http://127.0.0.1:${API_PORT}/api/v1/runtime/tasks/pending?project_id=${PROJECT_ID}" 2>/dev/null || echo 000)
    if [ "$auth_code" = 200 ]; then
      result OK runtime-pending 200 "$(head -c 180 /tmp/nexus-dispatch-health-api.json 2>/dev/null || true)"
    else
      result CRITICAL runtime-pending "$auth_code" "expected 200 with Bearer token"
    fi
  else
    result WARNING api-token missing "PM_API_TOKEN/API_AUTH_TOKEN not exported; skip authenticated runtime smoke"
  fi

  sse_code=$(timeout 5 curl -sS -N -o /tmp/nexus-dispatch-health-sse.txt -w "%{http_code}" "http://127.0.0.1:${API_PORT}/api/v1/events/stream" 2>/dev/null || true)
  if grep -q "connected" /tmp/nexus-dispatch-health-sse.txt 2>/dev/null; then
    result OK sse-stream connected "event stream emitted connected frame"
  else
    result WARNING sse-stream "${sse_code:-timeout}" "no connected frame within timeout"
  fi
}

check_webui() {
  section "WebUI"
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:${WEBUI_PORT}/" 2>/dev/null || echo 000)
  if [ "$code" = 200 ]; then
    result OK webui 200 "http://127.0.0.1:${WEBUI_PORT}/"
  else
    result WARNING webui "$code" "WebUI not reachable; may be unbuilt or not deployed"
  fi
}

check_daemon() {
  section "Daemon"
  if [ "$QUICK_MODE" = true ]; then
    result OK daemon skipped "quick mode"
    return
  fi
  cid=$(docker compose ps -q nexus-daemon 2>/dev/null || true)
  if [ -n "$cid" ]; then
    logs=$(docker logs --since 10m "$cid" 2>&1 | tail -40 || true)
    if echo "$logs" | grep -q "\[Tick Summary\]"; then
      result OK daemon-tick active "recent [Tick Summary] found"
    else
      result WARNING daemon-tick no-summary "no [Tick Summary] in recent docker logs"
    fi
    if echo "$logs" | grep -Eqi "fatal|uncaught|crash"; then
      result CRITICAL daemon-logs fatal "fatal/crash keyword found"
    else
      result OK daemon-logs checked "no fatal/crash keyword in recent logs"
    fi
  elif command -v journalctl >/dev/null 2>&1 && systemctl is-active nexus-dispatch-daemon.service >/dev/null 2>&1; then
    if journalctl -u nexus-dispatch-daemon.service --since "10 minutes ago" --no-pager 2>/dev/null | grep -q "\[Tick Summary\]"; then
      result OK daemon-tick active "recent journal tick found"
    else
      result WARNING daemon-tick no-summary "no recent journal tick found"
    fi
  else
    result WARNING daemon not-found "no compose container or active systemd unit"
  fi
}

check_files() {
  section "Files & Schema"
  [ -f .env ] && result OK env-file exists ".env present" || result WARNING env-file missing "copy .env.example to .env"
  [ -f docker-compose.yml ] && result OK compose-file exists "docker-compose.yml present" || result CRITICAL compose-file missing "docker-compose.yml missing"
  [ -f prisma/schema.prisma ] && result OK prisma-schema exists "schema present" || result CRITICAL prisma-schema missing "schema missing"
  if command -v npx >/dev/null 2>&1; then
    if npx prisma validate >/tmp/nexus-dispatch-prisma-validate.log 2>&1; then
      result OK prisma-validate passed "schema validates"
    else
      result CRITICAL prisma-validate failed "see /tmp/nexus-dispatch-prisma-validate.log"
    fi
  else
    result WARNING npx missing "skip prisma validate"
  fi
}

check_compose
check_systemd
check_api
check_webui
check_daemon
check_files

if [ "$JSON_OUTPUT" = true ]; then
  python3 - "$TIMESTAMP" "$CHECKS_TOTAL" "$CRITICALS" "$WARNINGS" "${RESULTS[@]}" <<'PY'
import json, sys
timestamp,total,crit,warn,*results=sys.argv[1:]
print(json.dumps({
  "timestamp": timestamp,
  "project": "nexus-dispatch",
  "checks_total": int(total),
  "criticals": int(crit),
  "warnings": int(warn),
  "status": "unhealthy" if int(crit) else ("degraded" if int(warn) else "healthy"),
  "results": results,
}, ensure_ascii=False, indent=2))
PY
else
  echo ""
  echo "Nexus Dispatch Health Check — $TIMESTAMP"
  for line in "${RESULTS[@]}"; do echo "  $line"; done
  echo ""
  echo "Summary: $CHECKS_TOTAL checks | $CRITICALS critical | $WARNINGS warnings"
fi

if [ "$CRITICALS" -gt 0 ]; then exit 1; fi
if [ "$WARNINGS" -gt 0 ]; then exit 2; fi
exit 0
