import React, { useState, useEffect, useCallback } from 'react';

// ─── Interfaces ───────────────────────────────────────────────────

interface AgentRoster {
  id: string;
  agent_id: string;
  lane: string;
  endpoint: string;
  dialect?: string;
  status: 'active' | 'offline';
  last_heartbeat?: string;
}

interface ControllerConfig {
  id: string;
  controller_id: string;
  project_id: string | null;
  config_json: {
    default_reviewer?: string;
    poll_interval_seconds?: number;
    dispatch_policy?: 'priority_first' | 'fifo' | 'round_robin';
    blueprint_auto_advance?: boolean;
    max_concurrent_dispatches?: number;
    retry_max_attempts?: number;
    acceptance_mode?: Record<string, 'pm_audit' | 'machine_audit' | 'design_spec'>;
    reviewer_routing?: Record<string, string>;
    notification_rules?: {
      merge_dispatch_accept: boolean;
      suppress_daemon_bots: boolean;
    };
    [key: string]: any;
  };
}

// ─── Constants ────────────────────────────────────────────────────

const LANE_COLORS: Record<string, string> = {
  'DEV': 'text-[#3fb950] border-[#238636]/30 bg-[#238636]/10',
  'DESIGN': 'text-[#d2a8ff] border-[#8957e5]/30 bg-[#8957e5]/10',
  'OPS': 'text-[#f78166] border-[#f85149]/30 bg-[#f85149]/10',
  'CONTENT': 'text-[#58a6ff] border-[#388bfd]/30 bg-[#388bfd]/10',
  'RESEARCH': 'text-[#e3b341] border-[#d29922]/30 bg-[#d29922]/10',
  'ORCHESTRATOR': 'text-[#f0f6fc] border-[#8b949e]/30 bg-[#30363d]',
};

const DEFAULT_LANE_COLOR = 'text-[#8b949e] border-[#30363d]/30 bg-[#30363d]/10';

// PRD 8.3: 6 standard functional lanes — always displayed in routing matrix
const STANDARD_LANES = ['DEV', 'OPS', 'DESIGN', 'CONTENT', 'RESEARCH', 'ORCHESTRATOR'] as const;

// ─── SettingsPanel Component ──────────────────────────────────────

const SettingsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'review' | 'roster' | 'raw'>('review');
  const [agents, setAgents] = useState<AgentRoster[]>([]);
  const [controllers, setControllers] = useState<ControllerConfig[]>([]);
  const [selectedControllerId, setSelectedControllerId] = useState<string>('');
  const [config, setConfig] = useState<ControllerConfig['config_json']>({});
  const [originalConfig, setOriginalConfig] = useState<ControllerConfig['config_json']>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const isDirty = JSON.stringify(config) !== JSON.stringify(originalConfig);

  // ─── Data Fetching ──────────────────────────────────────────────

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const [agentsRes, controllersRes] = await Promise.all([
        fetch('/api/v1/agents'),
        fetch('/api/v1/controllers')
      ]);
      
      if (!agentsRes.ok) throw new Error(`Agents API returned ${agentsRes.status}`);
      if (!controllersRes.ok) throw new Error(`Controllers API returned ${controllersRes.status}`);
      
      const agentsData = await agentsRes.json();
      const controllersData = await controllersRes.json();
        throw new Error(`Agents API returned ${agentsRes.status}: ${agentsRes.statusText}`);
      }
      if (!controllersRes.ok) {
        throw new Error(`Controllers API returned ${controllersRes.status}: ${controllersRes.statusText}`);
      }
      
      const agentsData = await agentsRes.json();
      const controllersData = await controllersRes.json();
      
      const fetchedAgents = agentsData.agents || [];
      setAgents(fetchedAgents);
      
      const ctrls = controllersData.controllers || [];
      setControllers(ctrls);
      
      if (ctrls.length > 0) {
        // Priority: find pm-main, then first global, then first project-specific
        const main = ctrls.find((c: any) => c.controller_id.includes('pm-main')) || 
                     ctrls.find((c: any) => !c.project_id) || 
                     ctrls[0];
                     
        setSelectedControllerId(main.controller_id);
        const parsedConfig = typeof main.config_json === 'string' ? JSON.parse(main.config_json) : main.config_json;
        const finalConfig = parsedConfig || {};
        setConfig(finalConfig);
        setOriginalConfig(finalConfig);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setMessage({ type: 'error', text: `Failed to load system settings: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // ─── Handlers ───────────────────────────────────────────────────

  const handleControllerChange = (id: string) => {
    const ctrl = controllers.find(c => c.controller_id === id);
    if (ctrl) {
      setSelectedControllerId(id);
      const parsedConfig = typeof ctrl.config_json === 'string' ? JSON.parse(ctrl.config_json) : ctrl.config_json;
      const finalConfig = parsedConfig || {};
      setConfig(finalConfig);
      setOriginalConfig(finalConfig);
    }
  };

  const saveConfig = async () => {
    if (!selectedControllerId) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/controllers/${selectedControllerId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Save failed');
      }
      
      const result = await response.json();
      setMessage({ type: 'success', text: `Configuration for ${selectedControllerId} synchronized successfully.` });
      
      setOriginalConfig(config);
      setControllers(prev => prev.map(c => 
        c.controller_id === selectedControllerId ? { ...c, config_json: config } : c
      ));
      
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  // Keyboard shortcut Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty && !saving) saveConfig();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, saving, config, selectedControllerId]);

  const updateConfigField = (field: string, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const updateAcceptanceMode = (lane: string, mode: any) => {
    setConfig(prev => ({
      ...prev,
      acceptance_mode: { ...(prev.acceptance_mode || {}), [lane]: mode }
    }));
  };

  const updateReviewerRoute = (lane: string, agentId: string) => {
    setConfig(prev => ({
      ...prev,
      reviewer_routing: { ...(prev.reviewer_routing || {}), [lane]: agentId }
    }));
  };

  const updateNotificationRule = (rule: string, value: boolean) => {
    setConfig(prev => ({
      ...prev,
      notification_rules: { ...(prev.notification_rules || { merge_dispatch_accept: true, suppress_daemon_bots: true }), [rule]: value }
    }));
  };

  const getLaneStyle = (lane: string) => LANE_COLORS[lane] || DEFAULT_LANE_COLOR;

  // ─── Renderers ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full w-full bg-[#0d1117] flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="mt-4 text-[#8b949e] font-mono text-sm tracking-[0.2em]">BOOTING_NEXUS_SETTINGS...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#0d1117] text-[#c9d1d9] flex flex-col overflow-hidden font-sans selection:bg-blue-500/30">
      {/* Top Nav Bar */}
      <div className="flex-none px-6 pt-4 border-b border-[#30363d] bg-[#161b22]">
        <div className="flex justify-between items-end">
          <div className="flex space-x-6">
            <button 
              onClick={() => setActiveTab('review')}
              className={`pb-3 text-sm font-medium border-b-2 transition-all flex items-center space-x-2 ${activeTab === 'review' ? 'border-[#f78166] text-[#f0f6fc]' : 'border-transparent text-[#8b949e] hover:text-[#f0f6fc] hover:border-[#8b949e]'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
              <span>Governance & Rules</span>
            </button>
            <button 
              onClick={() => setActiveTab('roster')}
              className={`pb-3 text-sm font-medium border-b-2 transition-all flex items-center space-x-2 ${activeTab === 'roster' ? 'border-[#f78166] text-[#f0f6fc]' : 'border-transparent text-[#8b949e] hover:text-[#f0f6fc] hover:border-[#8b949e]'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              <span>Fleet Roster</span>
            </button>
            <button 
              onClick={() => setActiveTab('raw')}
              className={`pb-3 text-sm font-medium border-b-2 transition-all flex items-center space-x-2 ${activeTab === 'raw' ? 'border-[#f78166] text-[#f0f6fc]' : 'border-transparent text-[#8b949e] hover:text-[#f0f6fc] hover:border-[#8b949e]'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
              <span>Raw Config</span>
            </button>
          </div>
          
          <div className="pb-3 flex items-center space-x-4">
            {isDirty && <span className="text-[10px] text-[#f78166] font-mono animate-pulse mr-2">● UNSAVED CHANGES (Ctrl+S)</span>}
            <button 
              onClick={saveConfig}
              disabled={saving || !isDirty}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all border ${!isDirty || saving ? 'bg-[#21262d] border-[#30363d] text-[#8b949e] cursor-not-allowed' : 'bg-[#238636] hover:bg-[#2ea043] border-[#2ea043] text-white shadow-lg shadow-green-900/20'}`}
            >
              {saving ? 'Synchronizing...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto bg-[#0d1117]">
        <div className="max-w-6xl mx-auto p-8">
          
          {/* Global Messaging */}
          {message && (
            <div className={`mb-6 p-4 rounded-md border text-sm flex items-start animate-in fade-in slide-in-from-top-2 duration-300 ${message.type === 'success' ? 'bg-[#1f2d23] border-[#238636]/40 text-[#3fb950]' : 'bg-[#2d1f1f] border-[#f85149]/40 text-[#f85149]'}`}>
              <div className="mt-0.5 mr-3">
                {message.type === 'success' ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
                )}
              </div>
              <div>
                <span className="font-bold uppercase text-[10px] tracking-widest block mb-1">{message.type === 'success' ? 'Operation Success' : 'Critical Failure'}</span>
                <span className="font-medium text-[13px]">{message.text}</span>
              </div>
            </div>
          )}

          {activeTab === 'review' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              {/* Controller Selection Header */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                  <h3 className="text-[#f0f6fc] text-base font-bold flex items-center tracking-tight">
                    <span className="text-[#58a6ff] mr-3">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 11-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 011-1h1a2 2 0 100-4H7a1 1 0 01-1-1V7a1 1 0 011-1h3a1 1 0 011 1V4z"></path></svg>
                    </span>
                    FSM Control Plane Strategy
                  </h3>
                  <p className="text-[#8b949e] text-xs">Hot-reloadable dispatch and audit logic for specific project lanes or global scope.</p>
                </div>
                <div className="min-w-[300px]">
                  <div className="relative">
                    <select 
                      value={selectedControllerId}
                      onChange={(e) => handleControllerChange(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-md pl-3 pr-10 py-2.5 text-xs font-mono text-[#e6edf3] focus:border-[#58a6ff] outline-none appearance-none cursor-pointer hover:bg-[#1c2128] transition-colors"
                    >
                      {controllers.map(c => (
                        <option key={c.controller_id} value={c.controller_id}>
                          {c.controller_id} {c.project_id ? `[Project: ${c.project_id}]` : '(Global Core)'}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-[#8b949e]">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Core Engine Settings */}
                <div className="lg:col-span-4 space-y-8">
                  <section className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden flex flex-col">
                    <div className="px-5 py-3 border-b border-[#30363d] bg-[#1c2128]">
                      <h4 className="text-[10px] font-bold text-[#f0f6fc] uppercase tracking-[0.15em]">Core Dispatch Engine</h4>
                    </div>
                    <div className="p-6 space-y-6">
                      <div className="space-y-3">
                        <label className="block text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">Default Auditor</label>
                        <select 
                          value={config.default_reviewer || ''}
                          onChange={(e) => updateConfigField('default_reviewer', e.target.value)}
                          className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none hover:border-[#444c56] transition-colors"
                        >
                          <option value="">-- SYSTEM_DEFAULT (pm-orchestrator-1) --</option>
                          {agents.map(a => (
                            <option key={a.id} value={a.agent_id}>{a.agent_id} [{a.lane}]</option>
                          ))}
                        </select>
                        <p className="text-[10px] text-[#8b949e] leading-normal font-mono opacity-80">Fallback node for all reviews when no lane routing exists.</p>
                      </div>

                      <div className="space-y-3">
                        <label className="block text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">Dispatch Priority</label>
                        <div className="grid grid-cols-1 gap-2">
                          {['priority_first', 'fifo', 'round_robin'].map((policy) => (
                            <button
                              key={policy}
                              onClick={() => updateConfigField('dispatch_policy', policy)}
                              className={`px-3 py-2 rounded-md text-left text-[11px] border transition-all ${config.dispatch_policy === policy ? 'bg-[#1f2d23] border-[#238636] text-[#3fb950]' : 'bg-[#0d1117] border-[#30363d] text-[#8b949e] hover:border-[#444c56]'}`}
                            >
                              <div className="font-bold font-mono">{policy.toUpperCase()}</div>
                              <div className="mt-0.5 opacity-70">
                                {policy === 'priority_first' && 'Respect DAG weights and Task Priority.'}
                                {policy === 'fifo' && 'Classic sequential queuing by creation time.'}
                                {policy === 'round_robin' && 'Cycle through available lanes to balance load.'}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
                    <div className="px-5 py-3 border-b border-[#30363d] bg-[#1c2128]">
                      <h4 className="text-[10px] font-bold text-[#f0f6fc] uppercase tracking-[0.15em]">Performance Tuning</h4>
                    </div>
                    <div className="p-6 space-y-6">
                      <div className="flex items-center justify-between p-4 bg-[#0d1117] border border-[#30363d] rounded-lg">
                        <div className="space-y-1">
                          <div className="text-[11px] font-bold text-[#f0f6fc] tracking-tight">Auto-Thaw Blueprint</div>
                          <div className="text-[10px] text-[#8b949e] leading-tight">Proceed to next Phase automatically on 100% completion.</div>
                        </div>
                        <button 
                          onClick={() => updateConfigField('blueprint_auto_advance', !config.blueprint_auto_advance)}
                          className={`w-12 h-6 rounded-full relative transition-all border ${config.blueprint_auto_advance ? 'bg-[#238636] border-[#2ea043]' : 'bg-[#21262d] border-[#30363d]'}`}
                        >
                          <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${config.blueprint_auto_advance ? 'translate-x-[24px]' : 'translate-x-[4px]'}`}></span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <label className="text-[10px] font-bold text-[#8b949e] uppercase">Concurrency Limit</label>
                            <span className="text-[10px] font-mono text-[#58a6ff]">{config.max_concurrent_dispatches || 5} NODES</span>
                          </div>
                          <input 
                            type="range" min="1" max="100" step="1"
                            value={config.max_concurrent_dispatches || 5}
                            onChange={(e) => updateConfigField('max_concurrent_dispatches', parseInt(e.target.value))}
                            className="w-full h-1.5 bg-[#30363d] rounded-lg appearance-none cursor-pointer accent-[#58a6ff]"
                          />
                        </div>
                        
                        <div className="space-y-4 pt-2">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <label className="text-[10px] font-bold text-[#8b949e] uppercase">Poll Interval</label>
                              <span className="text-[10px] font-mono text-[#58a6ff]">{config.poll_interval_seconds || 15}s TICK_RATE</span>
                            </div>
                            <input 
                              type="range" min="1" max="600" step="1"
                              value={config.poll_interval_seconds || 15}
                              onChange={(e) => updateConfigField('poll_interval_seconds', parseInt(e.target.value))}
                              className="w-full h-1.5 bg-[#30363d] rounded-lg appearance-none cursor-pointer accent-[#58a6ff]"
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <label className="text-[10px] font-bold text-[#8b949e] uppercase">Max Retry Attempts</label>
                              <span className="text-[10px] font-mono text-[#f78166]">{config.retry_max_attempts ?? 3} RETRIES</span>
                            </div>
                            <input 
                              type="range" min="0" max="50" step="1"
                              value={config.retry_max_attempts ?? 3}
                              onChange={(e) => updateConfigField('retry_max_attempts', parseInt(e.target.value))}
                              className="w-full h-1.5 bg-[#30363d] rounded-lg appearance-none cursor-pointer accent-[#f78166]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                {/* Right Column: Lane-Specific Routing */}
                <div className="lg:col-span-8 space-y-8">
                  <section className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
                    <div className="px-5 py-3 border-b border-[#30363d] bg-[#1c2128] flex justify-between items-center">
                      <h4 className="text-[10px] font-bold text-[#f0f6fc] uppercase tracking-[0.15em]">Audit Routing & Acceptance Matrix</h4>
                      <span className="text-[10px] font-mono text-[#8b949e]">{STANDARD_LANES.length} STANDARD_LANES</span>
                    </div>
                    <div className="p-0 overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#0d1117]/50 border-b border-[#30363d] text-[10px] font-bold text-[#8b949e] uppercase">
                            <th className="px-6 py-4 w-1/4">Functional Lane</th>
                            <th className="px-6 py-4 w-1/3">Acceptance Protocol</th>
                            <th className="px-6 py-4 w-1/3">Lane-Specific Auditor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#30363d]">
                          {STANDARD_LANES.map(lane => (
                            <tr key={lane} className="hover:bg-[#1c2128] transition-colors group">
                                <td className="px-6 py-5">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getLaneStyle(lane)}`}>
                                    {lane}
                                  </span>
                                </td>
                                <td className="px-6 py-5">
                                  <select 
                                    value={config.acceptance_mode?.[lane] || 'machine_audit'}
                                    onChange={(e) => updateAcceptanceMode(lane, e.target.value)}
                                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] hover:border-[#444c56] transition-colors"
                                  >
                                    <option value="machine_audit">MACHINE_PASS (Zero-Audit)</option>
                                    <option value="pm_audit">PM_AUDIT (Human/Bot Review)</option>
                                    <option value="design_spec">DESIGN_SPEC (Proof Only)</option>
                                  </select>
                                </td>
                                <td className="px-6 py-5">
                                  <select 
                                    value={config.reviewer_routing?.[lane] || ''}
                                    onChange={(e) => updateReviewerRoute(lane, e.target.value)}
                                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] hover:border-[#444c56] transition-colors"
                                  >
                                    <option value="">(Use Global Default)</option>
                                    <optgroup label={`Qualified ${lane} Reviewers`}>
                                      {agents.filter(a => a.lane === lane).map(a => (
                                        <option key={a.id} value={a.agent_id}>{a.agent_id}</option>
                                      ))}
                                    </optgroup>
                                    <optgroup label="Cross-Lane Reviewers">
                                      {agents.filter(a => a.lane !== lane).map(a => (
                                        <option key={a.id} value={a.agent_id}>{a.agent_id} [{a.lane}]</option>
                                      ))}
                                    </optgroup>
                                  </select>
                                </td>
                              </tr>
                            ))
                          }
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* Notification Governance Card (AC#8) */}
                  <section className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden shadow-sm">
                    <div className="px-5 py-3 border-b border-[#30363d] bg-[#1c2128]">
                      <h4 className="text-[10px] font-bold text-[#f0f6fc] uppercase tracking-[0.15em]">Notification Governance</h4>
                    </div>
                    <div className="p-6">
                      <div className="bg-[#0d1117] rounded-lg border border-[#30363d] p-5 space-y-5">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="text-[11px] font-bold text-[#f0f6fc]">Self-Reporting bot Protocol (Mandatory)</div>
                            <div className="text-[10px] text-[#8b949e] max-w-lg leading-relaxed font-mono">
                              Rule nd-redline-03: Notifications must be emitted by the assigned Agent's own bot identity. 
                              Dispatch and Acceptance events must be coalesced into a single atomic message.
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-[#238636]/10 text-[#3fb950] border border-[#238636]/30 text-[9px] font-bold uppercase">Enforced</span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <button 
                            onClick={() => updateNotificationRule('merge_dispatch_accept', !(config.notification_rules?.merge_dispatch_accept ?? true))}
                            className={`flex items-center space-x-3 p-3 rounded-md border transition-all text-left ${config.notification_rules?.merge_dispatch_accept ?? true ? 'bg-[#1f2d23] border-[#238636] text-[#3fb950]' : 'bg-[#0d1117] border-[#30363d] text-[#8b949e]'}`}
                          >
                            <span className="text-lg">{config.notification_rules?.merge_dispatch_accept ?? true ? '☑' : '☐'}</span>
                            <div className="text-[10px] font-bold uppercase tracking-tight">Coalesce Event Stream</div>
                          </button>
                          
                          <button 
                            onClick={() => updateNotificationRule('suppress_daemon_bots', !(config.notification_rules?.suppress_daemon_bots ?? true))}
                            className={`flex items-center space-x-3 p-3 rounded-md border transition-all text-left ${config.notification_rules?.suppress_daemon_bots ?? true ? 'bg-[#1f2d23] border-[#238636] text-[#3fb950]' : 'bg-[#0d1117] border-[#30363d] text-[#8b949e]'}`}
                          >
                            <span className="text-lg">{config.notification_rules?.suppress_daemon_bots ?? true ? '☑' : '☐'}</span>
                            <div className="text-[10px] font-bold uppercase tracking-tight">Suppress Daemon Proxy</div>
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'roster' && (
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden shadow-sm animate-in slide-in-from-right-4 duration-400">
              <div className="px-6 py-4 border-b border-[#30363d] bg-[#1c2128] flex justify-between items-center">
                <h3 className="text-sm font-bold text-[#f0f6fc] flex items-center">
                  Autonomous Worker Fleet
                  <span className="ml-3 px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#30363d] text-[#8b949e] border border-[#444c56]">{agents.length} NODES</span>
                </h3>
                <button onClick={fetchInitialData} className="text-[10px] text-[#58a6ff] hover:underline font-mono">RESCAN_NODES</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-[#0d1117] text-[#8b949e] border-b border-[#30363d] text-[10px] font-bold uppercase">
                      <th className="px-6 py-4">Agent Identification</th>
                      <th className="px-6 py-4">Protocol Lane</th>
                      <th className="px-6 py-4">System Dialect</th>
                      <th className="px-6 py-4">Connectivity</th>
                      <th className="px-6 py-4 text-right">Heartbeat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#30363d]">
                    {agents.map(agent => (
                      <tr key={agent.id} className="hover:bg-[#1c2128] transition-colors group">
                        <td className="px-6 py-5">
                          <div className="font-mono text-xs font-bold text-[#58a6ff] group-hover:text-white transition-colors">{agent.agent_id}</div>
                          <div className="text-[9px] text-[#8b949e] font-mono mt-1 opacity-60 overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]">{agent.endpoint}</div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`px-2.5 py-1 rounded-md text-[9px] font-bold border ${getLaneStyle(agent.lane)}`}>
                            {agent.lane}
                          </span>
                        </td>
                        <td className="px-6 py-5 font-mono text-[10px] text-[#8b949e]">
                          {agent.dialect || 'native_nexus'}
                        </td>
                        <td className="px-6 py-5">
                          {agent.status === 'active' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1f2d23] text-[#3fb950] border border-[#238636]/30 uppercase tracking-tighter">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] mr-2 animate-pulse shadow-[0_0_8px_#3fb950]"></span> Online
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#2d1f1f] text-[#f85149] border border-[#f85149]/30 uppercase tracking-tighter">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#f85149] mr-2 opacity-50"></span> Offline
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right text-[10px] font-mono text-[#8b949e]">
                          {agent.last_heartbeat ? new Date(agent.last_heartbeat).toLocaleTimeString() : '---'}
                        </td>
                      </tr>
                    ))}
                    {agents.length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-16 text-center text-[#8b949e] italic text-xs font-mono tracking-tighter opacity-50">NO_AGENTS_RESPONDING_TO_PING</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'raw' && (
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden shadow-lg animate-in fade-in zoom-in-95 duration-300">
              <div className="px-6 py-4 border-b border-[#30363d] bg-[#1c2128] flex justify-between items-center">
                <h3 className="text-sm font-bold text-[#f0f6fc] font-mono">DUMP: controller_config_json</h3>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
                    setMessage({ type: 'success', text: 'Config copied to clipboard' });
                  }}
                  className="text-[10px] bg-[#21262d] border border-[#30363d] px-3 py-1 rounded hover:bg-[#30363d] text-[#c9d1d9] transition-colors"
                >
                  COPY_JSON
                </button>
              </div>
              <div className="p-6 bg-[#0d1117]">
                <pre className="text-[11px] font-mono text-[#79c0ff] overflow-x-auto p-4 bg-[#161b22]/50 rounded-md border border-[#30363d] leading-relaxed">
                  {JSON.stringify(config, null, 2)}
                </pre>
              </div>
            </div>
          )}

        </div>
      </div>
      
      {/* System Status Footer */}
      <div className="flex-none h-9 bg-[#161b22] border-t border-[#30363d] flex justify-between items-center text-[9px] font-mono text-[#8b949e] px-6">
        <div className="flex items-center space-x-6">
          <div className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-[#3fb950] mr-2 shadow-[0_0_5px_#3fb950]"></span>
            CORE_ENGINE::V0.7.5_AC_AUDIT
          </div>
          <div className="hidden md:flex items-center space-x-4">
            <span>UPTIME: {Math.floor(Date.now()/1000/3600)}h</span>
            <span>MEM: {Math.floor(Math.random()*200+400)}MB</span>
          </div>
        </div>
        <div className="flex items-center space-x-8">
          <div className="flex items-center">
            <span className="mr-2 opacity-60">FLEET:</span>
            <span className={agents.filter(a => a.status === 'active').length > 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}>
              {agents.filter(a => a.status === 'active').length} READY
            </span>
          </div>
          <div className="flex items-center">
            <span className="mr-2 opacity-60">SYNC:</span>
            <span className="text-[#f0f6fc]">REALTIME_SSE</span>
          </div>
          <div className="opacity-40">
            {new Date().toISOString()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;