export interface Task {
    task_id: string;
    project_id: string;
    title: string;
    status: 'draft' | 'dispatched' | 'in_progress' | 'blocked' | 'completed' | 'escalated';
    owner?: string;
    dependencies: string[];
}

export interface Artifact {
    type: 'repo_commit' | 'live_url' | 'screenshot' | 'metric_log';
    payload: Record<string, any>;
}
