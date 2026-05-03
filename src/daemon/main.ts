import axios from 'axios';
import DAL from '../db/dal';
import { AdapterFactory } from '../adapters';

// Sleep helper
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class Daemon {
    private dal: DAL;
    private running: boolean = false;

    constructor() {
        this.dal = new DAL();
    }

    async tick() {
        // Find tasks in 'created' state with no dependencies (indegree = 0)
        // Since we don't have dependency resolution yet, we just take 'created' tasks
        const db = (this.dal as any).db;
        
        // Grab one task using CAS (Compare And Swap) equivalent
        // First we lock by updating state from 'created' to 'dispatched'
        const stmt = db.prepare(`
            UPDATE nexus_tasks 
            SET status = 'dispatched' 
            WHERE id = (
                SELECT id FROM nexus_tasks 
                WHERE status = 'created' 
                LIMIT 1
            )
            RETURNING *;
        `);
        
        const task = stmt.get();
        if (!task) {
            return;
        }

        console.log(`Dispatched task: ${task.id}`);

        try {
            // Get mock worker url. In a real scenario, this would come from a worker registry/allocation.
            const workerUrl = 'http://localhost:8001/v1/webhook/artifacts'; // placeholder

            // Generate payload using AdapterFactory
            const adapter = AdapterFactory.get_adapter('openclaw');
            const payload = adapter.adapt(task);
            
            // Send payload to worker
            await axios.post(workerUrl, payload, { timeout: 3000 });

        } catch (error: any) {
            console.error(`Failed to dispatch task ${task.id}:`, error.message);
            // Rollback on failure, increment retry count
            db.prepare(`
                UPDATE nexus_tasks
                SET status = 'created', retry_count = retry_count + 1
                WHERE id = ?
            `).run(task.id);
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
        this.dal.close();
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
