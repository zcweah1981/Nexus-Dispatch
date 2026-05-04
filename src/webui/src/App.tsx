import React, { useState } from 'react';
import DAGView from './components/DAGView';
import FleetRadar from './components/FleetRadar';
import ArtifactGallery from './components/ArtifactGallery';
import SettingsPanel from './components/SettingsPanel';
import 'reactflow/dist/style.css';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dag' | 'radar' | 'gallery' | 'settings'>('dag');

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-900 text-white overflow-hidden">
      <header className="flex-none p-4 bg-gray-800 border-b border-gray-700 flex justify-between items-center shadow-md">
        <h1 className="text-xl font-bold font-mono tracking-wider"><span className="text-blue-400">Nexus</span> Dispatch <span className="text-xs font-normal text-gray-500 ml-2">v0.7.5-DESIGN</span></h1>
        <div className="flex space-x-1 bg-gray-900 p-1 rounded-lg">
          <button
            className={`px-4 py-2 rounded-md transition-colors text-sm font-medium ${
              activeTab === 'dag' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
            onClick={() => setActiveTab('dag')}
          >
            DAG View
          </button>
          <button
            className={`px-4 py-2 rounded-md transition-colors text-sm font-medium ${
              activeTab === 'radar' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
            onClick={() => setActiveTab('radar')}
          >
            Fleet Radar
          </button>
          <button
            className={`px-4 py-2 rounded-md transition-colors text-sm font-medium ${
              activeTab === 'gallery' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
            onClick={() => setActiveTab('gallery')}
          >
            Artifact Gallery
          </button>
          <button
            className={`px-4 py-2 rounded-md transition-colors text-sm font-medium ${
              activeTab === 'settings' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800'
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
