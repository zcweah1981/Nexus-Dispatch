#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES = ROOT / 'src/api/routes.ts'
SERVICE = ROOT / 'src/services/v8_runtime_api_service.ts'
REPO = ROOT / 'src/repositories/v8.ts'
TEST = ROOT / 'tests/v8/v8_webui_runtime_read_api.test.ts'
WEBUI_ROOT = ROOT / 'src/webui/src'

route_text = ROUTES.read_text()
service_text = SERVICE.read_text()
repo_text = REPO.read_text()
test_text = TEST.read_text()

required_routes = [
    "/runtime/projects/:projectId/summary",
    "/runtime/projects/:projectId/tasks",
    "/runtime/projects/:projectId/groups",
    "/runtime/projects/:projectId/dispatch/live",
    "/runtime/projects/:projectId/reports",
    "/runtime/projects/:projectId/artifacts",
    "/runtime/projects/:projectId/settings",
    "/runtime/projects/:projectId/directories",
    "/runtime/projects/:projectId/observability",
]
required_service_calls = [
    "service.getProjectSummary",
    "service.listTasksForWebUI",
    "service.listTaskGroupsForWebUI",
    "service.getDispatchLive",
    "service.listReportsForWebUI",
    "service.listArtifactsForWebUI",
    "service.getProjectSettingsForWebUI",
    "service.getProjectDirectoriesForWebUI",
    "service.getObservabilityForWebUI",
]
required_service_methods = [
    "async getProjectSummary",
    "async listTasksForWebUI",
    "async listTaskGroupsForWebUI",
    "async getDispatchLive",
    "async listReportsForWebUI",
    "async listArtifactsForWebUI",
    "async getProjectSettingsForWebUI",
    "async getProjectDirectoriesForWebUI",
    "async getObservabilityForWebUI",
]

runtime_start = route_text.index('V8-R2 Runtime API + FSM Controller boundary')
runtime_end = route_text.index('// ═══════════════════════════════════════════════════════════════\n  //  T2.1:')
runtime_section = route_text[runtime_start:runtime_end]

webui_hits = []
if WEBUI_ROOT.exists():
    deny = re.compile(r"(better-sqlite3|sqlite3|@prisma/client|PrismaClient|DATABASE_URL|process\.env|\.env|\bfs\b|readFile|writeFile|/root/|\.db\b)")
    for path in sorted(WEBUI_ROOT.rglob('*')):
        if path.suffix in {'.ts', '.tsx'}:
            text = path.read_text(errors='ignore')
            for m in deny.finditer(text):
                webui_hits.append({'file': str(path.relative_to(ROOT)), 'match': m.group(0)})

runtime_forbidden = re.compile(r"better-sqlite3|sqlite3|data/nexus\.db|prisma/data/nexus\.db|\$queryRaw|\$executeRaw")
route_direct_prisma = re.compile(r"prismaDal\.client\.(project|task|run|report|artifact|agent)\.(create|update|updateMany|findUnique|findFirst|findMany|count)")
secret_surface = re.compile(r"raw_proof|payload_json|delivery_json|proof_data|soul_prompt|tools_allowed|bot_token|chat_id|DATABASE_URL")

result = {
    'ok': True,
    'required_routes': {route: route in route_text for route in required_routes},
    'required_service_calls': {call: call in runtime_section for call in required_service_calls},
    'required_service_methods': {method: method in service_text for method in required_service_methods},
    'route_boundary': {
        'runtime_forbidden_hits': runtime_forbidden.findall(runtime_section),
        'direct_prisma_hits': route_direct_prisma.findall(runtime_section),
    },
    'webui_direct_db_or_fs_hits': webui_hits,
    'redaction_contract_in_test': all(token in test_text for token in ['expectNoSecretsOrRawProof', 'sk-r37-secret', 'project-scoped WebUI MVP read endpoints']),
    'repository_read_helpers': {
        'artifact_list': 'async list(projectId: string, filters?: { task_id?: string; run_id?: string; artifact_type?: string; limit?: number })' in repo_text,
        'report_list_limit': 'dedupe_key?: string; limit?: number' in repo_text,
        'project_scoped_agents_by_default': "filters?.include_global ? { OR: [{ project_id: projectId }, { project_id: null }] } : { project_id: projectId }" in repo_text,
    },
    'notes': [
        'Daemon heartbeat remains unavailable/demo-only in observability response until a daemon heartbeat source lands.',
        'Directory endpoint returns sanitized API-side references only; WebUI still must be wired in a follow-up card.',
    ],
}

if not all(result['required_routes'].values()):
    result['ok'] = False
if not all(result['required_service_calls'].values()):
    result['ok'] = False
if not all(result['required_service_methods'].values()):
    result['ok'] = False
if result['route_boundary']['runtime_forbidden_hits'] or result['route_boundary']['direct_prisma_hits']:
    result['ok'] = False
if result['webui_direct_db_or_fs_hits']:
    result['ok'] = False
if not result['redaction_contract_in_test']:
    result['ok'] = False
if not all(result['repository_read_helpers'].values()):
    result['ok'] = False

print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(0 if result['ok'] else 1)
