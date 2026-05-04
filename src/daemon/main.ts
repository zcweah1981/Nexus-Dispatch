import axios from 'axios';
import { AdapterFactory } from '../adapters';
import { PrismaDAL } from '../db/prisma_dal';
import { FreezerEngine } from '../engine/freezer';

// Sleep helper
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class Daemon {
        private running: boolean = false;
        private prismaDal: PrismaDAL | null = null;
        private freezerEngine: FreezerEngine | null = null;

    constructor() {
            }

    /**
     * 初始化 PrismaDAL 和 FreezerEngine
     */
    private async ensureInit() {
        if (!this.prismaDal) {
            const dbUrl = process.env.DATABASE_URL || 'file:../prisma/data/nexus.db';
            this.prismaDal = new PrismaDAL(dbUrl);
            await this.prismaDal.initPragmas();
            this.freezerEngine = new FreezerEngine(this.prismaDal);
        }
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

        // ─── T3.2: Freezer Engine — tick 末尾闭环 ──────────────
        // 对所有已知 project 执行 check → closeout → thaw 流程
        await this.runFreezerTick();
    }

    /**
     * runFreezerTick — 在 tick 末尾执行冷冻库闭环
     *
     * 查找所有活跃 project，对每个 project 运行 FreezerEngine.run_once()
     * 通知由被派 Agent 自己的 bot 发送到群组，本方法不负责通知
     */
    private async runFreezerTick() {
        try {
            await this.ensureInit();
            if (!this.prismaDal || !this.freezerEngine) return;

            // 获取所有活跃项目
            const projects = await (this.prismaDal as any).prisma.project.findMany({
                where: { status: 'active' },
            });

            for (const project of projects) {
                const result = await this.freezerEngine.run_once(project.id);
                if (result.groups_archived.length > 0) {
                    console.log(
                        `[Freezer] Project ${project.id}: archived groups [${result.groups_archived.join(', ')}], ` +
                        `injected ${Object.values(result.tasks_injected).flat().length} new tasks`,
                    );
                }
                if (result.errors.length > 0) {
                    console.error(`[Freezer] Project ${project.id} errors:`, result.errors);
                }
            }
        } catch (error: any) {
            console.error('[Freezer] Tick error:', error.message);
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
    
    async stop() {
        this.running = false;
        if (this.prismaDal) {
            await this.prismaDal.close();
        }
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
