export const PROJECT_ID = 'nexus-dispatch';
const API_BASE = '/api/v1/runtime';
export interface RuntimeTask {
id: string;
project_id: string;
title: string;
objective?: string | null;
lane_required?: string | null;
status: string;
task_group_id?: string | null;
group_id?: string | null;
phase_id?: string | null;
reviewer?: string | null;
proof_summary?: string | null;
latest_run?: RuntimeRun | null;
dependencies?: Array<{ task_id: string; depends_on_id: string; dependency_type?: string }>;
created_at?: string;
updated_at?: string;
}
export interface RuntimeRun {
run_id: string;
project_id?: string;
task_id?: string;
agent_id?: string;
status: string;
result_summary?: string | null;
started_at?: string;
ended_at?: string | null;
}
export interface RuntimeGroup {
id: string;
project_id: string;
group_id: string;
name: string;
description?: string | null;
status: string;
priority?: number;
phase_id?: string | null;
tasks?: Array<Pick<RuntimeTask, 'id' | 'title' | 'status' | 'lane_required'>>;
created_at?: string;
updated_at?: string;
}
export interface RuntimeAgent {
id?: string;
project_id?: string | null;
agent_id: string;
lane: string;
dialect?: string | null;
status: string;
endpoint_display_ref?: string | null;
last_heartbeat?: string | null;
created_at?: string;
}
export interface RuntimeSettings {
project_id: string;
project?: { id: string; name: string; status?: string; created_at?: string };
visible_language?: string;
supported_visible_languages?: string[];
config?: Record<string, unknown>;
policies?: Record<string, unknown>;
}
export interface RuntimeDirectories {
project_id: string;
directories?: Record<string, { ref?: string | null; access?: string }>;
leak_summary?: Record<string, unknown>;
}
export interface RuntimeObservability {
project_id: string;
api?: { status: string };
daemon?: { status: string; fallback?: string };
queue_depth?: number;
failed_runs?: number;
blocked_tasks?: number;
dead_letter_tasks?: number;
worker_heartbeat?: { online: number; total: number };
}
export interface RuntimeReport {
id: string;
project_id: string;
task_id?: string | null;
run_id?: string | null;
message_type: string;
status: string;
summary?: string | null;
created_at?: string;
updated_at?: string;
}
export interface RuntimeArtifact {
id: string;
project_id: string;
task_id?: string | null;
run_id?: string | null;
artifact_type: string;
path?: string | null;
proof_summary?: string | null;
created_at?: string;
}
export interface RuntimeSummary {
project?: { id: string; name: string; status?: string; created_at?: string };
lifecycle_stage?: string;
active_group?: { id: string; group_id: string; name: string; status: string } | null;
task_counts_by_status?: Record<string, number>;
run_counts_by_status?: Record<string, number>;
report_counts_by_status?: Record<string, number>;
risk_flags?: { blocked?: number; dead_letter?: number };
next_responsible?: string;
health?: { api?: string; data_source?: string; project_scoped?: boolean };
}
export interface RuntimeAuditEvent {
id: string;
project_id: string;
actor: string;
action: string;
target_type: string;
target_id: string;
reason?: string | null;
created_at?: string;
}
export interface RuntimeRealtimeEvent {
id: number;
type: string;
data: Record<string, unknown>;
timestamp: number;
}
export interface RuntimeConnectionStatus {
status: 'connected' | 'degraded' | 'offline';
checked_at?: string;
message?: string;
}
export interface RuntimeReleaseReadiness {
project_id: string;
project_scoped: boolean;
ready: boolean;
blockers: Array<{ type: string; count: number }>;
task_counts_by_status?: Record<string, number>;
run_counts_by_status?: Record<string, number>;
proof_counts_by_type?: Record<string, number>;
reports_sent?: number;
generated_at?: string;
}
export interface RuntimeProofSummary {
id: string;
project_id: string;
task_id?: string | null;
run_id?: string | null;
artifact_type: string;
proof_summary: string;
source?: string;
created_at?: string;
}
export interface RuntimeRealtimeConnectionState {
transport: 'sse' | 'polling';
fallback_transport?: 'polling';
project_scoped: boolean;
active_connections?: number;
retained_events?: number;
dropped_events?: number;
}
export interface RuntimeOpsStatus {
project_id: string;
docker_compose_webui_port: string;
runtime_api_health: { status: string; endpoint: string };
worker_endpoint_health: { online: number; total: number; status: string };
github_ci_configured: boolean;
github_ci_status: 'configured' | 'unconfigured';
sqlite_wal_db_lock_warning: string;
cache_ttl_ms?: number;
generated_at?: string;
}
export interface RuntimeTemplateSummary {
id: string;
title: string;
category: string;
safe_api_template_abstraction: true;
description: string;
inputs: string[];
output_contract: string;
}
export type ControlledTaskAction = 'dispatch' | 'retry' | 'cancel';
export interface ControlledActionRequest {
actor: string;
reason: string;
idempotency_key?: string;
}
export interface ControlledActionResult<T = unknown> {
preview?: ControlledPreview;
result?: T;
audit_event?: RuntimeAuditEvent;
audit_reference?: string;
status?: string;
}
export interface ControlledPreview {
action: string;
validation: { ok: boolean; warnings: string[]; blockers: string[] };
confirm_token: string;
expected_api: string;
audit_reference: string;
}
async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
const response = await fetch(`${API_BASE}${path}`, {
...init,
headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(init.headers || {}) },
});
if (!response.ok) throw new Error(`Runtime API ${response.status}: ${path}`);
return response.json() as Promise<T>;
}
function query(params: Record<string, string | number | boolean | undefined | null>) {
const search = new URLSearchParams();
for (const [key, value] of Object.entries(params)) {
if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
}
const serialized = search.toString();
return serialized ? `?${serialized}` : '';
}
function postJson<T>(path: string, body: unknown): Promise<T> {
return requestJson<T>(path, { method: 'POST', body: JSON.stringify(body) });
}
function patchJson<T>(path: string, body: unknown): Promise<T> {
return requestJson<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}
function buildPreview(action: string, expectedApi: string, reason: string): ControlledPreview {
const blockers = reason.trim().length === 0 ? ['reason_required'] : [];
return {
action,
validation: { ok: blockers.length === 0, warnings: [], blockers },
confirm_token: blockers.length === 0 ? `confirm:${action}` : '',
expected_api: expectedApi,
audit_reference: 'audit_event_pending',
};
}
// R38_CONTROLLED_ACTIONS_API_CLIENT_CONTRACT: every controlled write goes through this Runtime API client boundary.
export const runtimeApi = {
getSummary(projectId = PROJECT_ID) {
return requestJson<{ summary: RuntimeSummary }>(`/projects/${projectId}/summary`);
},
async getRuntimeConnectionStatus(projectId = PROJECT_ID): Promise<RuntimeConnectionStatus> {
try {
await requestJson<{ summary: RuntimeSummary }>(`/projects/${projectId}/summary`);
return { status: 'connected', checked_at: new Date().toISOString() };
} catch {
return { status: 'offline', checked_at: new Date().toISOString(), message: 'runtime_unavailable' };
}
},
listTasks(projectId = PROJECT_ID, options: { include_graph?: boolean; status?: string; lane?: string; task_group_id?: string; limit?: number; cursor?: string; offset?: number; cache_ttl_ms?: number } = {}) {
return requestJson<{ tasks: RuntimeTask[]; next_cursor?: string; total?: number }>(`/projects/${projectId}/tasks${query(options)}`);
},
listGroups(projectId = PROJECT_ID, options: { include_tasks?: boolean; limit?: number } = {}) {
return requestJson<{ groups: RuntimeGroup[] }>(`/projects/${projectId}/groups${query(options)}`);
},
getDispatchLive(projectId = PROJECT_ID, options: { limit?: number } = {}) {
return requestJson<{ dispatch_live: { project_id: string; runs: RuntimeRun[]; active_runs: RuntimeRun[]; queue_depth: number } }>(`/projects/${projectId}/dispatch/live${query(options)}`);
},
listReports(projectId = PROJECT_ID, options: { message_type?: string; status?: string; task_id?: string; limit?: number } = {}) {
return requestJson<{ reports: RuntimeReport[] }>(`/projects/${projectId}/reports${query(options)}`);
},
listArtifacts(projectId = PROJECT_ID, options: { task_id?: string; run_id?: string; artifact_type?: string; limit?: number } = {}) {
return requestJson<{ artifacts: RuntimeArtifact[] }>(`/projects/${projectId}/artifacts${query(options)}`);
},
getSettings(projectId = PROJECT_ID) {
return requestJson<{ settings: RuntimeSettings }>(`/projects/${projectId}/settings`);
},
listAgents(projectId = PROJECT_ID) {
return requestJson<{ agents: RuntimeAgent[] }>(`/projects/${projectId}/agents`);
},
getDirectories(projectId = PROJECT_ID) {
return requestJson<{ directories: RuntimeDirectories }>(`/projects/${projectId}/directories`);
},
getObservability(projectId = PROJECT_ID) {
return requestJson<{ observability: RuntimeObservability }>(`/projects/${projectId}/observability`);
},
getReleaseReadiness(projectId = PROJECT_ID) {
return requestJson<{ release_readiness: RuntimeReleaseReadiness }>(`/projects/${projectId}/release/readiness`);
},
searchProofs(projectId = PROJECT_ID, options: { query?: string; artifact_type?: string; task_id?: string; run_id?: string; limit?: number; cursor?: string; offset?: number; cache_ttl_ms?: number } = {}) {
return requestJson<{ project_id: string; proofs: RuntimeProofSummary[]; total: number; next_cursor?: string }>(`/projects/${projectId}/proofs${query(options)}`);
},
getOpsStatus(projectId = PROJECT_ID) {
return requestJson<{ ops_status: RuntimeOpsStatus }>(`/projects/${projectId}/ops/status`);
},
listTemplates(projectId = PROJECT_ID, options: { category?: string; limit?: number; cursor?: string; offset?: number; cache_ttl_ms?: number } = {}) {
const path = `/projects/${projectId}/templates`; return requestJson<{ project_id: string; templates: RuntimeTemplateSummary[]; total: number; next_cursor?: string }>(path + query(options));
},
listAuditEvents(projectId = PROJECT_ID, options: { action?: string; target_type?: string; target_id?: string; limit?: number } = {}) {
return requestJson<{ project_id: string; audit_events: RuntimeAuditEvent[]; total: number }>(`/projects/${projectId}/audit-events${query(options)}`);
},
pollRealtimeEvents(projectId = PROJECT_ID, options: { after?: number; limit?: number } = {}) {
return requestJson<{ project_id: string; transport: 'polling'; events: RuntimeRealtimeEvent[]; next_cursor: number; connection_state: RuntimeRealtimeConnectionState }>(`/projects/${projectId}/events/poll${query(options)}`);
},
getRealtimeConnectionState(projectId = PROJECT_ID) {
return requestJson<{ project_id: string; connection_state: RuntimeRealtimeConnectionState }>(`/projects/${projectId}/events/state`);
},
controlledTaskAction(projectId = PROJECT_ID, taskId: string, action: ControlledTaskAction, input: ControlledActionRequest) {
return postJson<ControlledActionResult<{ task: RuntimeTask }>>(`/projects/${projectId}/tasks/${taskId}/${action}`, input);
},
updateLowRiskSettings(projectId = PROJECT_ID, input: ControlledActionRequest & { visible_language?: string }) {
return patchJson<ControlledActionResult<{ settings: RuntimeSettings }>>(`/projects/${projectId}/settings`, input);
},
previewControlledAction(action: string, expectedApi: string, reason: string) {
return buildPreview(action, expectedApi, reason);
},
confirmControlledAction<T>(preview: ControlledPreview, execute: () => Promise<T>): Promise<T> {
if (!preview.validation.ok || !preview.confirm_token) {
return Promise.reject(new Error('controlled_action_validation_failed'));
}
return execute();
},
};
