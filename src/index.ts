import { NexusToolchain } from './pm-core/NexusToolchain';
import { createServer } from './api/server';
import DAL from './db/dal';

export { NexusToolchain };

if (require.main === module) {
    const dal = new DAL();
    
    // Initialize schema if not exists
    dal.initSchema(`
        CREATE TABLE IF NOT EXISTS nexus_projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'active'
        );
        CREATE TABLE IF NOT EXISTS nexus_tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            objective TEXT,
            lane TEXT,
            status TEXT DEFAULT 'created',
            max_retries INTEGER DEFAULT 3,
            retry_count INTEGER DEFAULT 0,
            payload_schema TEXT,
            ext_meta TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS nexus_runs (
            run_id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            worker_id TEXT NOT NULL,
            idempotency_key TEXT UNIQUE,
            status TEXT DEFAULT 'running',
            error_stack TEXT,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME
        );
        CREATE TABLE IF NOT EXISTS nexus_workers (
            id TEXT PRIMARY KEY,
            lane TEXT NOT NULL,
            status TEXT DEFAULT 'online',
            last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS nexus_artifacts (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            artifact_type TEXT NOT NULL,
            payload_data TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    const app = createServer(dal);
    const PORT = process.env.PORT || 8000;
    
    app.listen(PORT, () => {
        console.log(`Nexus Dispatch API Server running on port ${PORT}`);
    });
}
