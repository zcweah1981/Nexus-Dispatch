import React from 'react';

const ArtifactGallery: React.FC = () => {
  const artifacts = [
    { id: 'art-1', taskId: 'T1.1', title: 'Setup Scaffolding', sha: 'a1b2c3d', image: 'https://via.placeholder.com/300x200/1e293b/a78bfa?text=Docker+Compose' },
    { id: 'art-2', taskId: 'T2.1', title: 'API Server', sha: 'e4f5g6h', image: 'https://via.placeholder.com/300x250/1e293b/a78bfa?text=API+Docs' },
    { id: 'art-3', taskId: 'T3.1', title: 'DAG Engine', sha: 'i7j8k9l', image: 'https://via.placeholder.com/300x150/1e293b/a78bfa?text=Graph+Test' },
  ];

  return (
    <div className="p-6 h-full overflow-auto bg-gray-900">
      <h2 className="text-xl font-mono mb-4 text-purple-400">Artifact Gallery</h2>
      <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
        {artifacts.map((art) => (
          <div key={art.id} className="break-inside-avoid bg-gray-800 rounded-lg overflow-hidden shadow-lg border border-gray-700 hover:border-purple-500 transition-colors">
            <img src={art.image} alt={art.title} className="w-full object-cover" />
            <div className="p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-purple-400 bg-purple-900 bg-opacity-50 px-2 py-1 rounded">{art.taskId}</span>
                <span className="text-xs font-mono text-gray-500">{art.sha}</span>
              </div>
              <h3 className="text-sm font-semibold text-gray-200">{art.title}</h3>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ArtifactGallery;
