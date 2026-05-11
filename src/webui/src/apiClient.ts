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

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } });
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

export const runtimeApi = {
  getSummary(projectId = PROJECT_ID) {
    return requestJson<{ summary: RuntimeSummary }>(`/projects/${projectId}/summary`);
  },
  listTasks(projectId = PROJECT_ID, options: { include_graph?: boolean; status?: string; lane?: string; task_group_id?: string; limit?: number } = {}) {
    return requestJson<{ tasks: RuntimeTask[] }>(`/projects/${projectId}/tasks${query(options)}`);
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
};
