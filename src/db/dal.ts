import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

// Define DB Type interfaces
export interface Task {
    id: string;
    project_id: string;
    title: string;
    objective: string;
    lane: string;
    status: 'created' | 'dispatched' | 'validating' | 'completed' | 'failed';
    max_retries: number;
    retry_count: number;
    payload_schema: any;
    ext_meta: any;
    created_at: string;
}

export interface Run {
    run_id: string;
    task_id: string;
    worker_id: string;
    idempotency_key: string;
    status: 'running' | 'success' | 'failed';
    error_stack?: string | null;
    started_at: string;
    ended_at?: string | null;
}

class DAL {
    private db: Database.Database;

    constructor(dbPath: string = path.resolve(__dirname, '../../data/nexus.db')) {
        this.db = new Database(dbPath);
        
        // Critical: Enable WAL mode and Foreign Keys as per SSD specification
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
    }

    // Initialize Schema
    public initSchema(schemaSql: string): void {
        this.db.exec(schemaSql);
    }

    // Task Operations
    public updateTaskStatus(taskId: string, status: Task['status']): void {
        const stmt = this.db.prepare(`
            UPDATE nexus_tasks
            SET status = ?
            WHERE id = ?
        `);
        
        const tx = this.db.transaction(() => {
            stmt.run(status, taskId);
            
            // Broadcast state change
            try {
                const { stateEmitter } = require('../api/server');
                if (stateEmitter) {
                    stateEmitter.emit('state_change', {
                        type: 'task_status_updated',
                        data: { task_id: taskId, status }
                    });
                }
            } catch (err) {}
        });
        
        tx();
    }

    public createTask(task: Omit<Task, 'id' | 'created_at' | 'status' | 'retry_count'> & { id?: string }): string {
        const id = task.id || uuidv4();
        const stmt = this.db.prepare(`
            INSERT INTO nexus_tasks (id, project_id, title, objective, lane, payload_schema, ext_meta, max_retries)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const tx = this.db.transaction(() => {
            stmt.run(
                id,
                task.project_id,
                task.title,
                task.objective,
                task.lane,
                JSON.stringify(task.payload_schema || {}),
                JSON.stringify(task.ext_meta || {}),
                task.max_retries || 3
            );
            
            try {
                const { stateEmitter } = require('../api/server');
                if (stateEmitter) {
                    stateEmitter.emit('state_change', {
                        type: 'task_created',
                        data: { task_id: id }
                    });
                }
            } catch (err) {}
        });
        
        tx();
        return id;
    }

    // Run Operations
    public createRun(run: Omit<Run, 'run_id' | 'started_at' | 'ended_at' | 'status'> & { run_id?: string }): string {
        const run_id = run.run_id || uuidv4();
        const stmt = this.db.prepare(`
            INSERT INTO nexus_runs (run_id, task_id, worker_id, idempotency_key)
            VALUES (?, ?, ?, ?)
        `);
        
        const tx = this.db.transaction(() => {
            stmt.run(
                run_id,
                run.task_id,
                run.worker_id,
                run.idempotency_key
            );
            
            try {
                const { stateEmitter } = require('../api/server');
                if (stateEmitter) {
                    stateEmitter.emit('state_change', {
                        type: 'run_created',
                        data: { run_id, task_id: run.task_id }
                    });
                }
            } catch (err) {}
        });
        
        tx();
        return run_id;
    }
    
    // Concurrency safe Run Status Update using transaction
    public updateRunStatus(runId: string, status: 'success' | 'failed', errorStack: string | null = null): void {
        const updateRunStmt = this.db.prepare(`
            UPDATE nexus_runs 
            SET status = ?, error_stack = ?, ended_at = CURRENT_TIMESTAMP
            WHERE run_id = ?
        `);

        // Transaction ensures data integrity
        const tx = this.db.transaction(() => {
            updateRunStmt.run(status, errorStack, runId);
            
            // Broadcast state change if stateEmitter is available
            try {
                const { stateEmitter } = require('../api/server');
                if (stateEmitter) {
                    stateEmitter.emit('state_change', {
                        type: 'run_status_updated',
                        data: { run_id: runId, status, error_stack: errorStack }
                    });
                }
            } catch (err) {
                // Ignore if server module isn't loaded yet
            }
        });

        tx();
    }
    
    // Retrieve a task by ID
    public getTask(id: string): Task | undefined {
        const row = this.db.prepare('SELECT * FROM nexus_tasks WHERE id = ?').get(id) as any;
        if (!row) return undefined;
        return {
            ...row,
            payload_schema: JSON.parse(row.payload_schema),
            ext_meta: JSON.parse(row.ext_meta)
        };
    }
    
    // Retrieve a run by ID
    public getRun(runId: string): Run | undefined {
        return this.db.prepare('SELECT * FROM nexus_runs WHERE run_id = ?').get(runId) as Run;
    }
    
    // Helper to create required pre-requisites for testing
    public _createProjectAndWorker(projectId: string, workerId: string): void {
         const insertProject = this.db.prepare("INSERT OR IGNORE INTO nexus_projects (id, name, status) VALUES (?, 'Test Project', 'active')");
         const insertWorker = this.db.prepare("INSERT OR IGNORE INTO nexus_workers (id, lane, status) VALUES (?, 'LANE_CODE', 'online')");
         
         const tx = this.db.transaction(() => {
             insertProject.run(projectId);
             insertWorker.run(workerId);
         });
         tx();
    }
    
    public close(): void {
        this.db.close();
    }
}

export default DAL;