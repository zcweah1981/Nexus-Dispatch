import sqlite3 from 'sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DATABASE_URL?.replace('sqlite://', '') || path.join(__dirname, '../../data/nexus.db');

export class DAL {
    private db: sqlite3.Database;

    constructor() {
        const dbDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        this.db = new sqlite3.Database(DB_PATH);
        this.db.serialize(() => {
            this.db.run('PRAGMA journal_mode=WAL;');
            this.db.run('PRAGMA foreign_keys=ON;');
        });
    }

    public initSchema(): Promise<void> {
        return new Promise((resolve, reject) => {
            const schemaPath = path.join(__dirname, 'migrations/V1__init_schema.sql');
            const schema = fs.readFileSync(schemaPath, 'utf8');
            this.db.exec(schema, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    public createProject(name: string): Promise<string> {
        const id = randomUUID();
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO nexus_projects (id, name, status) VALUES (?, ?, ?)',
                [id, name, 'active'],
                (err) => {
                    if (err) reject(err);
                    else resolve(id);
                }
            );
        });
    }

    public createTask(projectId: string, title: string, objective: string, lane: string): Promise<string> {
        const id = randomUUID();
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO nexus_tasks (id, project_id, title, objective, lane, status) VALUES (?, ?, ?, ?, ?, ?)',
                [id, projectId, title, objective, lane, 'created'],
                (err) => {
                    if (err) reject(err);
                    else resolve(id);
                }
            );
        });
    }

    public createRun(taskId: string, workerId: string, retryNum: number): Promise<string> {
        const runId = randomUUID();
        const idempotencyKey = `${taskId}_${retryNum}`;
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO nexus_runs (run_id, task_id, worker_id, idempotency_key, status) VALUES (?, ?, ?, ?, ?)',
                [runId, taskId, workerId, idempotencyKey, 'running'],
                (err) => {
                    if (err) reject(err);
                    else resolve(runId);
                }
            );
        });
    }

    public updateRunStatus(runId: string, status: string, errorStack?: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE nexus_runs SET status = ?, error_stack = ?, ended_at = CURRENT_TIMESTAMP WHERE run_id = ?',
                [status, errorStack || null, runId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
    
    public getTask(taskId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM nexus_tasks WHERE id = ?', [taskId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    public close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}
