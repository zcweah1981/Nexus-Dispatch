import React, { useEffect, useState } from 'react';

const PROJECT_ID = 'nexus-dispatch';
const AUTH_TOKEN = '***';
const REVIEW_LEVELS = ['group_only', 'pm_audit_immediate'] as const;

// V8_SETTINGS_REGISTRY_CONTRACT: SettingsPanel is a read-only registry console for
// agents, review policies, and project_cronjobs. It consumes V8 Runtime API only;
// it must not start/stop scheduler jobs or mutate task state.

type ReviewLevel = typeof REVIEW_LEVELS[number];

interface AgentRoster {
  id: string;
  agent_id: string;
  project_id?: string | null;
  lane: string;
  endpoint?: string;
  dialect?: string;
  status: string;
  last_heartbeat?: string | null;
}

interface ReviewPolicy {
  id: string;
  project_id: string;
  policy_id: string;
  agent_id?: string | null;
  lane?: string | null;
  reviewer_agent_id: string;
  priority: number;
  enabled: boolean;
  policy_json?: string | null;
}

interface ProjectCronjob {
  id: string;
  project_id: string;
  cronjob_id: string;
  name: string;
  schedule: string;
  status: 'active' | 'paused' | 'disabled' | string;
  enabled_policy?: string;
  owner_agent_id?: string | null;
  last_run_at?: string | null;
}

interface RegistryState {
  agents: AgentRoster[];
  reviewPolicies: ReviewPolicy[];
  cronjobs: ProjectCronjob[];
}

const SettingsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'review' | 'roster' | 'cron' | 'system'>('review');
  const [state, setState] = useState<RegistryState>({ agents: [], reviewPolicies: [], cronjobs: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  });

  const fetchInitialData = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [agentsRes, reviewPolicyRes, cronjobRes] = await Promise.all([
        fetchWithAuth(`/api/v1/runtime/projects/${PROJECT_ID}/agents`),
        fetchWithAuth(`/api/v1/runtime/projects/${PROJECT_ID}/review-policies`),
        fetchWithAuth(`/api/v1/runtime/projects/${PROJECT_ID}/cronjobs`),
      ]);

      if (!agentsRes.ok || !reviewPolicyRes.ok || !cronjobRes.ok) {
        throw new Error('Failed to load V8 registry settings');
      }

      const [agentsData, reviewPolicyData, cronjobData] = await Promise.all([
        agentsRes.json(),
        reviewPolicyRes.json(),
        cronjobRes.json(),
      ]);

      setState({
        agents: agentsData.agents || [],
        reviewPolicies: reviewPolicyData.reviewPolicies || reviewPolicyData.review_policies || [],
        cronjobs: cronjobData.cronjobs || [],
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to load settings registries' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const activeAgents = state.agents.filter((agent) => agent.status === 'active' || agent.status === 'online');
  const reviewerAgents = state.agents.filter((agent) => ['REVIEW', 'DESIGN', 'PM'].includes(agent.lane));

  const renderReviewLevel = (policy: ReviewPolicy): ReviewLevel => {
    try {
      const parsed = policy.policy_json ? JSON.parse(policy.policy_json) : {};
      return parsed?.review_level === 'pm_audit_immediate' ? 'pm_audit_immediate' : 'group_only';
    } catch {
      return 'group_only';
    }
  };

  if (loading) {
    return (
      <div className="h-full w-full bg-[#0d1117] flex items-center justify-center">
        <div className="text-[#8b949e] font-mono text-sm tracking-widest uppercase">loading_v8_registries...</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#0d1117] text-gray-300 flex flex-col overflow-hidden font-sans">
      <div className="flex-none px-6 pt-4 border-b border-[#30363d] bg-[#161b22]">
        <div className="flex space-x-4">
          {[
            ['review', 'Review Policies'],
            ['roster', 'Agent Registry'],
            ['cron', 'Cron Registry'],
            ['system', 'System Boundary'],
          ].map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`pb-3 text-sm font-semibold border-b-2 transition-all ${activeTab === tab ? 'border-[#f78166] text-[#e6edf3]' : 'border-transparent text-[#7d8590] hover:text-[#e6edf3]'}`}
            >
              {label}
            </button>
          ))}
          <button onClick={fetchInitialData} className="ml-auto pb-3 text-xs font-mono text-[#58a6ff] hover:text-[#79c0ff]">REFRESH_API</button>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-8 bg-[#0d1117]">
        <div className="max-w-6xl mx-auto space-y-6">
          {message && (
            <div className={`p-4 rounded-md border text-sm ${message.type === 'success' ? 'bg-[#1f2d23] border-[#238636]/40 text-[#3fb950]' : 'bg-[#2d1f1f] border-[#f85149]/40 text-[#f85149]'}`}>
              {message.text}
            </div>
          )}

          {activeTab === 'review' && (
            <section className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-[#30363d] bg-[#1c2128]">
                <h3 className="text-[#e6edf3] text-sm font-bold uppercase tracking-widest">Review Policy Registry</h3>
                <p className="text-[#8b949e] text-[10px] font-mono mt-1">levels: group_only / pm_audit_immediate · reviewer routing comes from review_policies</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0d1117] text-[#8b949e] uppercase text-[10px]">
                    <tr><th className="px-5 py-3">Policy</th><th>Scope</th><th>Reviewer</th><th>Priority</th><th>Level</th><th>Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#30363d]">
                    {state.reviewPolicies.map((policy) => (
                      <tr key={policy.id} className="hover:bg-[#1c2128]">
                        <td className="px-5 py-4 font-mono text-[#58a6ff]">{policy.policy_id}</td>
                        <td className="font-mono">{policy.agent_id || policy.lane || 'project_default'}</td>
                        <td className="font-mono text-[#d2a8ff]">{policy.reviewer_agent_id}</td>
                        <td>{policy.priority}</td>
                        <td className="font-mono text-[#f78166]">{renderReviewLevel(policy)}</td>
                        <td>{policy.enabled ? 'enabled' : 'disabled'}</td>
                      </tr>
                    ))}
                    {state.reviewPolicies.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-[#8b949e] font-mono">no_review_policies_registered</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === 'roster' && (
            <section className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-[#30363d] bg-[#1c2128] flex justify-between">
                <div>
                  <h3 className="text-[#e6edf3] text-sm font-bold uppercase tracking-widest">Agent Registry</h3>
                  <p className="text-[#8b949e] text-[10px] font-mono mt-1">agents={state.agents.length} · active={activeAgents.length} · reviewers={reviewerAgents.length}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-5">
                {state.agents.map((agent) => (
                  <div key={agent.id} className="bg-[#0d1117] border border-[#30363d] rounded-md p-4">
                    <div className="font-mono text-[#58a6ff] text-xs font-bold">{agent.agent_id}</div>
                    <div className="mt-2 text-[10px] text-[#8b949e]">lane_{agent.lane} · {agent.dialect || 'hermes'}</div>
                    <div className="mt-3 text-[10px] font-mono text-[#e6edf3] truncate">{agent.endpoint || 'endpoint_not_set'}</div>
                    <div className={`mt-3 inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold ${agent.status === 'active' || agent.status === 'online' ? 'bg-[#1f2d23] text-[#3fb950]' : 'bg-[#2d1f1f] text-[#f85149]'}`}>{agent.status}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'cron' && (
            <section className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-[#30363d] bg-[#1c2128]">
                <h3 className="text-[#e6edf3] text-sm font-bold uppercase tracking-widest">Project Cron Registry</h3>
                <p className="text-[#8b949e] text-[10px] font-mono mt-1">registry status only; no scheduler start/stop side effects</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0d1117] text-[#8b949e] uppercase text-[10px]">
                    <tr><th className="px-5 py-3">Cronjob</th><th>Name</th><th>Schedule</th><th>Status</th><th>Policy</th><th>Owner</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#30363d]">
                    {state.cronjobs.map((cronjob) => (
                      <tr key={cronjob.id} className="hover:bg-[#1c2128]">
                        <td className="px-5 py-4 font-mono text-[#58a6ff]">{cronjob.cronjob_id}</td>
                        <td>{cronjob.name}</td>
                        <td className="font-mono">{cronjob.schedule}</td>
                        <td className="font-mono text-[#f78166]">{cronjob.status}</td>
                        <td className="font-mono">{cronjob.enabled_policy || 'always_on'}</td>
                        <td className="font-mono">{cronjob.owner_agent_id || 'unassigned'}</td>
                      </tr>
                    ))}
                    {state.cronjobs.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-[#8b949e] font-mono">no_project_cronjobs_registered</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === 'system' && (
            <section className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
              <h3 className="text-[#e6edf3] text-sm font-bold uppercase tracking-widest">API-only Boundary</h3>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="bg-[#0d1117] border border-[#30363d] rounded p-4"><b>Agents</b><br /><span className="font-mono text-[#8b949e]">/api/v1/runtime/projects/{PROJECT_ID}/agents</span></div>
                <div className="bg-[#0d1117] border border-[#30363d] rounded p-4"><b>Review Policies</b><br /><span className="font-mono text-[#8b949e]">/api/v1/runtime/projects/{PROJECT_ID}/review-policies</span></div>
                <div className="bg-[#0d1117] border border-[#30363d] rounded p-4"><b>Cron Registry</b><br /><span className="font-mono text-[#8b949e]">/api/v1/runtime/projects/{PROJECT_ID}/cronjobs</span></div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
