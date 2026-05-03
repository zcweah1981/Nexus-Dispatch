import axios from 'axios';
import { AdapterFactory } from '../adapters';

// Sleep helper
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class Daemon {
        private running: boolean = false;

    constructor() {
            }

    
    async tick() {
        // Instead of writing to DB directly to claim, the daemon now poll REST API.
        // Wait, the task says: "decouple pm_daemon from SQLite to use REST API polling"
        // So pm_daemon shouldn't use dal.db anymore for fetching.
        
        try {
            const pmApiUrl = process.env.PM_API_URL || 'http://localhost:8000/api/v1'; // Local PM API
            const token = process.env.PM_API_TOKEN || 'valid-token';
            
            // 1. Claim task
            const claimRes = await axios.post(`${pmApiUrl}/tasks/claim`, {}, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const task = claimRes.data.task;
            if (!task) return;
            
            console.log(`Dispatched task via API: ${task.id}`);
            
            try {
                // Get mock worker url
                const workerUrl = 'http://localhost:8001/v1/webhook/artifacts'; 

                // Generate payload
                const adapter = AdapterFactory.get_adapter('openclaw');
                const payload = adapter.adapt(task);
                
                // Enforce chroot workdir injection in task payload
                if (task.project_id) {
                    const basePath = process.env.NEXUS_PROJECTS_BASE || '/.hermes/projects';
                    const workdir = require('path').resolve(basePath, task.project_id);
                    payload.payload.workdir = workdir;
                }

                // Send payload
                await axios.post(workerUrl, payload, { timeout: 3000 });
            } catch (error: any) {
                console.error(`Failed to dispatch task ${task.id}:`, error.message);
                // 2. Release task via API on failure
                await axios.post(`${pmApiUrl}/tasks/${task.id}/release`, {}, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            }
        } catch (error: any) {
            if (error.response && error.response.status === 404) {
                // No tasks available
                return;
            }
            console.error('Error polling API:', error.message);
        }
    }

    async start() {
        this.running = true;
        console.log('Nexus Dispatch Daemon started...');
        while (this.running) {
            await this.tick();
            await sleep(5000);
        }
    }
    
    stop() {
        this.running = false;
                console.log('Nexus Dispatch Daemon stopped.');
    }
}

// Ensure it can be imported for testing or executed directly
if (require.main === module) {
    const daemon = new Daemon();
    // Handle graceful shutdown
    process.on('SIGINT', () => daemon.stop());
    process.on('SIGTERM', () => daemon.stop());
    daemon.start();
}

export default Daemon;
