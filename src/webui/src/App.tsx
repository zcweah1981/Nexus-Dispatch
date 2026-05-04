import React, { useState } from 'react';
import DAGView from './components/DAGView';
import FleetRadar from './components/FleetRadar';
import ArtifactGallery from './components/ArtifactGallery';
import SettingsPanel from './components/SettingsPanel';
import 'reactflow/dist/style.css';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dag' | 'radar' | 'gallery' | 'settings'>('dag');

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0d1117] text-[#c9d1d9] overflow-hidden">
      <header className="flex-none p-4 bg-[#161b22] border-b border-[#30363d] flex justify-between items-center shadow-md">
        <h1 className="text-xl font-bold font-mono tracking-wider"><span className="text-[#58a6ff]">Nexus</span> Dispatch <span className="text-xs font-normal text-[#8b949e] ml-2">v0.7.5-DESIGN</span></h1>
        <div className="flex space-x-1 bg-[#0d1117] p-1 rounded-lg">
          <button
            className={`px-4 py-2 rounded-md transition-colors text-sm font-medium ${
              activeTab === 'dag' ? 'bg-[#58a6ff] text-white shadow-sm' : 'text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d]'
            }`}
            onClick={() => setActiveTab('dag')}
          >
            DAG View
          </button>
          <button
            className={`px-4 py-2 rounded-md transition-colors text-sm font-medium ${
              activeTab === 'radar' ? 'bg-[#58a6ff] text-white shadow-sm' : 'text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d]'
            }`}
            onClick={() => setActiveTab('radar')}
          >
            Fleet Radar
          </button>
          <button
            className={`px-4 py-2 rounded-md transition-colors text-sm font-medium ${
              activeTab === 'gallery' ? 'bg-[#58a6ff] text-white shadow-sm' : 'text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d]'
            }`}
            onClick={() => setActiveTab('gallery')}
          >
            Artifact Gallery
          </button>
          <button
            className={`px-4 py-2 rounded-md transition-colors text-sm font-medium ${
              activeTab === 'settings' ? 'bg-[#58a6ff] text-white shadow-sm' : 'text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d]'
            }`}
            onClick={() => setActiveTab('settings')}
          >
            Engine Settings
          </button>
        </div>
      </header>

      <main className="flex-grow relative overflow-hidden">
        {activeTab === 'dag' && <DAGView />}
        {activeTab === 'radar' && <FleetRadar />}
        {activeTab === 'gallery' && <ArtifactGallery />}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
};

export default App;
