import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

const repoRoot = path.resolve(__dirname, '../..');
const contractPath = path.join(repoRoot, 'docs/v8/contracts/runtime-control-plane.contract.json');
const smokeSchemaPath = path.join(repoRoot, 'docs/v8/schema/v8_smoke_schema.sql');

describe('V8-R0 smoke baseline', () => {
  test('declares V8 runtime contract boundary without entering R1 implementation', () => {
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

    expect(contract.version).toBe('v8-r0');
    expect(contract.scope).toBe('smoke-contract-only');
    expect(contract.non_goals).toContain('R1-R9 implementation');
    expect(contract.task_statuses).toEqual([
      'created',
      'dispatched',
      'running',
      'completion_pending',
      'review_pending',
      'completed',
      'retry_ready',
      'blocked',
      'dead_letter',
      'cancelled',
    ]);
    expect(contract.legacy_status_mapping.validating).toBe('completion_pending');
    expect(contract.legacy_status_mapping.review_spawned).toBe('review_pending');
  });

  test('initializes smoke DB from checked-in schema only, never from production DB', () => {
    const schemaSql = fs.readFileSync(smokeSchemaPath, 'utf8');
    expect(schemaSql).toContain('-- V8-R0 smoke schema');
    expect(schemaSql).not.toMatch(/nexus\.db|prisma\/data|\/data\//);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-v8-smoke-'));
    const dbPath = path.join(tempDir, 'smoke.db');
    const db = new Database(dbPath);
    try {
      db.exec(schemaSql);
      const rows = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>;
      expect(rows.map((row) => row.name)).toEqual([
        'v8_artifacts',
        'v8_projects',
        'v8_runs',
        'v8_tasks',
      ]);

      const taskColumns = db.prepare('PRAGMA table_info(v8_tasks)').all() as Array<{ name: string }>;
      expect(taskColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining(['project_id', 'task_id', 'status', 'proof_json', 'created_at', 'updated_at']),
      );
    } finally {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
