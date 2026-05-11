import React, { useEffect, useMemo, useState } from 'react';
import 'reactflow/dist/style.css';
import { PROJECT_ID, RuntimeAgent, RuntimeArtifact, RuntimeDirectories, RuntimeGroup, RuntimeObservability, RuntimeReport, RuntimeRun, RuntimeSettings, RuntimeSummary, RuntimeTask, runtimeApi } from './apiClient';
import { Locale, t } from './i18n';

// R37_WEBUI_MVP_CONTRACT: lean read-only taskboard/settings WebUI over project-scoped V8 Runtime API.

type PageKey =
  | 'dashboard'
  | 'lifecycle'
  | 'kanban'
  | 'dispatchLive'
  | 'projectSettings'
  | 'agentRegistry'
  | 'directoryStructure'
  | 'observability';

const pageI18nKeys = {
  dashboard: 'page.dashboard',
  lifecycle: 'page.lifecycle',
  kanban: 'page.kanban',
  dispatchLive: 'page.dispatchLive',
  projectSettings: 'page.projectSettings',
  agentRegistry: 'page.agentRegistry',
  directoryStructure: 'page.directoryStructure',
  observability: 'page.observability',
} satisfies Record<PageKey, string>;

const pageKeys = Object.keys(pageI18nKeys) as PageKey[];

const kanbanColumns: Array<{ key: string; statuses: string[] }> = [
  { key: 'status.created', statuses: ['created'] },
  { key: 'status.running', statuses: ['dispatched', 'running', 'completion_pending'] },
  { key: 'status.review_pending', statuses: ['review_pending'] },
  { key: 'status.retry_ready', statuses: ['retry_ready', 'blocked', 'dead_letter', 'cancelled'] },
  { key: 'status.completed', statuses: ['completed'] },
];

interface AppState {
  summary?: RuntimeSummary;
  tasks: RuntimeTask[];
  groups: RuntimeGroup[];
  dispatchRuns: RuntimeRun[];
  reports: RuntimeReport[];
  artifacts: RuntimeArtifact[];
  settings?: RuntimeSettings;
  agents: RuntimeAgent[];
  directories?: RuntimeDirectories;
  observability?: RuntimeObservability;
}

const initialState: AppState = {
  tasks: [],
  groups: [],
  dispatchRuns: [],
  reports: [],
  artifacts: [],
  agents: [],
};

function statusLabel(status: string, locale: Locale) {
  return t(`status.${status}`, locale);
}

function StatCard({ label, value, tone = 'blue' }: { label: string; value: React.ReactNode; tone?: 'blue' | 'green' | 'orange' | 'red' }) {
  const tones = {
    blue: 'border-[#388bfd]/40 bg-[#0d419d]/20 text-[#58a6ff]',
    green: 'border-[#238636]/40 bg-[#1f6f3d]/20 text-[#3fb950]',
    orange: 'border-[#d29922]/40 bg-[#9e6a03]/20 text-[#e3b341]',
    red: 'border-[#f85149]/40 bg-[#da3633]/20 text-[#ff7b72]',
  };
  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#8b949e]">{label}</div>
      <div className="mt-2 text-2xl font-bold font-mono">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-[#e6edf3]">{title}</h2>
      {children}
    </section>
  );
}

function EmptyState({ locale }: { locale: Locale }) {
  return <div className="rounded border border-dashed border-[#30363d] p-6 text-center text-sm text-[#8b949e]">{t('emptyState', locale)}</div>;
}

const App: React.FC = () => {
  const [activePage, setActivePage] = useState<PageKey>('dashboard');
  const [locale, setLocale] = useState<Locale>('zh-CN');
  const [state, setState] = useState<AppState>(initialState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRuntime = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, tasks, groups, dispatchLive, reports, artifacts, settings, agents, directories, observability] = await Promise.all([
        runtimeApi.getSummary(PROJECT_ID),
        runtimeApi.listTasks(PROJECT_ID, { include_graph: true, limit: 100 }),
        runtimeApi.listGroups(PROJECT_ID, { include_tasks: true, limit: 100 }),
        runtimeApi.getDispatchLive(PROJECT_ID, { limit: 50 }),
        runtimeApi.listReports(PROJECT_ID, { limit: 50 }),
        runtimeApi.listArtifacts(PROJECT_ID, { limit: 50 }),
        runtimeApi.getSettings(PROJECT_ID),
        runtimeApi.listAgents(PROJECT_ID),
        runtimeApi.getDirectories(PROJECT_ID),
        runtimeApi.getObservability(PROJECT_ID),
      ]);
      setState({
        summary: summary.summary,
        tasks: tasks.tasks,
        groups: groups.groups,
        dispatchRuns: dispatchLive.dispatch_live.runs,
        reports: reports.reports,
        artifacts: artifacts.artifacts,
        settings: settings.settings,
        agents: agents.agents,
        directories: directories.directories,
        observability: observability.observability,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRuntime();
  }, []);

  const latestTimeline = useMemo(() => {
    const groupItems = state.groups.map((group) => ({ id: group.id, title: group.name, subtitle: group.group_id, status: group.status, time: group.updated_at ?? group.created_at, type: 'group' }));
    const taskItems = state.tasks.map((task) => ({ id: task.id, title: task.title, subtitle: task.group_id ?? task.task_group_id ?? 'ungrouped', status: task.status, time: task.updated_at ?? task.created_at, type: 'task' }));
    return [...groupItems, ...taskItems].sort((a, b) => String(b.time ?? '').localeCompare(String(a.time ?? ''))).slice(0, 12);
  }, [state.groups, state.tasks]);

  const renderDashboard = () => {
    const counts = state.summary?.task_counts_by_status ?? {};
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard label={t('label.project', locale)} value={state.summary?.project?.name ?? PROJECT_ID} />
          <StatCard label={t('label.queueDepth', locale)} value={state.observability?.queue_depth ?? 0} tone="orange" />
          <StatCard label="Completed" value={counts.completed ?? 0} tone="green" />
          <StatCard label="Blocked / Dead" value={`${state.observability?.blocked_tasks ?? 0}/${state.observability?.dead_letter_tasks ?? 0}`} tone="red" />
        </div>
        <Section title="Runtime Summary">
          <div className="grid grid-cols-1 gap-3 text-sm text-[#c9d1d9] md:grid-cols-3">
            <div>{t('label.nextResponsible', locale)}: <b>{state.summary?.next_responsible ?? 'pm'}</b></div>
            <div>{t('label.activeGroup', locale)}: <b>{state.summary?.active_group?.name ?? '—'}</b></div>
            <div>API: <b>{state.summary?.health?.api ?? 'unknown'}</b></div>
          </div>
        </Section>
      </div>
    );
  };

  const renderLifecycle = () => (
    <Section title={t('lifecycleTimeline', locale)}>
      {latestTimeline.length === 0 ? <EmptyState locale={locale} /> : (
        <div className="space-y-3">
          {latestTimeline.map((item) => (
            <div key={`${item.type}:${item.id}`} className="flex gap-3 rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
              <div className="mt-1 h-3 w-3 rounded-full bg-[#58a6ff]" />
              <div>
                <div className="text-sm font-semibold text-[#e6edf3]">{item.title}</div>
                <div className="text-xs text-[#8b949e]">{item.type} · {item.subtitle} · {statusLabel(item.status, locale)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );

  const renderKanban = () => (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      {kanbanColumns.map((column) => {
        const tasks = state.tasks.filter((task) => column.statuses.includes(task.status));
        return (
          <section key={column.key} className="min-h-[320px] rounded-xl border border-[#30363d] bg-[#161b22] p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#e6edf3]">{t(column.key, locale)}</h2>
              <span className="rounded-full bg-[#30363d] px-2 py-0.5 text-xs text-[#8b949e]">{tasks.length}</span>
            </div>
            <div className="space-y-3">
              {tasks.map((task) => (
                <article key={task.id} className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
                  <div className="text-sm font-semibold text-[#e6edf3]">{task.title}</div>
                  <div className="mt-2 text-xs text-[#8b949e]">{task.lane_required ?? 'lane'} · {task.group_id ?? 'no-group'}</div>
                  <div className="mt-2 text-[11px] text-[#58a6ff]">{task.proof_summary ?? 'Proof 已存系统'}</div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );

  const renderDispatchLive = () => (
    <Section title={t('page.dispatchLive', locale)}>
      {state.dispatchRuns.length === 0 ? <EmptyState locale={locale} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[#8b949e]"><tr><th className="py-2">Run</th><th>Task</th><th>Agent</th><th>Status</th><th>Summary</th></tr></thead>
            <tbody className="divide-y divide-[#30363d]">
              {state.dispatchRuns.map((run) => <tr key={run.run_id}><td className="py-3 font-mono text-[#58a6ff]">{run.run_id}</td><td>{run.task_id}</td><td>{run.agent_id ?? '—'}</td><td>{run.status}</td><td>{run.result_summary ?? '—'}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );

  const renderProjectSettings = () => (
    <Section title={t('page.projectSettings', locale)}>
      <div className="mb-3 rounded border border-[#d29922]/40 bg-[#9e6a03]/20 p-3 text-xs text-[#e3b341]">{t('readonlyNotice', locale)}</div>
      <pre className="overflow-auto rounded bg-[#0d1117] p-4 text-xs text-[#c9d1d9]">{JSON.stringify(state.settings, null, 2)}</pre>
    </Section>
  );

  const renderAgentRegistry = () => (
    <Section title={t('page.agentRegistry', locale)}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {state.agents.map((agent) => (
          <div key={agent.id ?? agent.agent_id} className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
            <div className="font-mono text-sm font-bold text-[#58a6ff]">{agent.agent_id}</div>
            <div className="mt-2 text-xs text-[#8b949e]">{agent.lane} · {agent.dialect ?? 'hermes'} · {agent.status}</div>
            <div className="mt-2 truncate text-[11px] text-[#c9d1d9]">{agent.endpoint_display_ref ?? 'endpoint_ref_unavailable'}</div>
          </div>
        ))}
      </div>
    </Section>
  );

  const renderDirectoryStructure = () => (
    <Section title={t('page.directoryStructure', locale)}>
      <div className="mb-3 text-xs text-[#8b949e]">API-side sanitized references only; browser never reads local filesystem.</div>
      <pre className="overflow-auto rounded bg-[#0d1117] p-4 text-xs text-[#c9d1d9]">{JSON.stringify(state.directories, null, 2)}</pre>
    </Section>
  );

  const renderObservability = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="API" value={state.observability?.api?.status ?? 'unknown'} tone="green" />
        <StatCard label="Daemon" value={state.observability?.daemon?.status ?? 'unknown'} tone="orange" />
        <StatCard label="Failed runs" value={state.observability?.failed_runs ?? 0} tone="red" />
        <StatCard label="Workers" value={`${state.observability?.worker_heartbeat?.online ?? 0}/${state.observability?.worker_heartbeat?.total ?? 0}`} />
      </div>
      <Section title="Reports / Artifacts">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded bg-[#0d1117] p-3 text-xs text-[#c9d1d9]">Reports: {state.reports.length}</div>
          <div className="rounded bg-[#0d1117] p-3 text-xs text-[#c9d1d9]">Artifacts: {state.artifacts.length}</div>
        </div>
      </Section>
    </div>
  );

  const renderPage = () => {
    if (loading) return <div className="p-8 text-[#8b949e]">Loading Runtime API...</div>;
    if (error) return <div className="m-8 rounded border border-[#f85149] bg-[#2d1f1f] p-4 text-[#ff7b72]">{error}</div>;
    switch (activePage) {
      case 'dashboard': return renderDashboard();
      case 'lifecycle': return renderLifecycle();
      case 'kanban': return renderKanban();
      case 'dispatchLive': return renderDispatchLive();
      case 'projectSettings': return renderProjectSettings();
      case 'agentRegistry': return renderAgentRegistry();
      case 'directoryStructure': return renderDirectoryStructure();
      case 'observability': return renderObservability();
      default: return null;
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0d1117] text-[#c9d1d9]">
      <header className="flex h-16 items-center justify-between border-b border-[#30363d] bg-[#161b22] px-5">
        <div>
          <h1 className="font-mono text-xl font-bold"><span className="text-[#58a6ff]">{t('app.title', locale)}</span></h1>
          <div className="text-[11px] text-[#8b949e]">{t('app.subtitle', locale)} · {PROJECT_ID}</div>
        </div>
        <div className="flex items-center gap-2">
          <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} className="rounded border border-[#30363d] bg-[#0d1117] px-2 py-1 text-xs">
            <option value="en">English</option>
            <option value="zh-CN">简体中文</option>
            <option value="zh-TW">繁體中文</option>
          </select>
          <button onClick={loadRuntime} className="rounded bg-[#238636] px-3 py-1 text-xs font-semibold text-white">Refresh</button>
        </div>
      </header>
      <div className="flex h-[calc(100vh-4rem)]">
        <nav className="w-64 shrink-0 border-r border-[#30363d] bg-[#0d1117] p-3">
          <div className="mb-3 rounded border border-[#30363d] bg-[#161b22] p-3 text-[11px] text-[#8b949e]">{t('readonlyNotice', locale)} · {t('label.noMutation', locale)}</div>
          {pageKeys.map((page) => (
            <button key={page} onClick={() => setActivePage(page)} className={`mb-1 block w-full rounded px-3 py-2 text-left text-sm ${activePage === page ? 'bg-[#1f6feb] text-white' : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#e6edf3]'}`}>
              {t(pageI18nKeys[page], locale)}
            </button>
          ))}
        </nav>
        <main className="flex-1 overflow-auto p-6">{renderPage()}</main>
      </div>
    </div>
  );
};

export default App;
