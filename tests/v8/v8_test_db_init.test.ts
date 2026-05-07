import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const repoRoot = path.resolve(__dirname, '../..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const initScriptPath = path.join(repoRoot, 'scripts/init-test-db.js');

describe('V8-R1 test DB migration initializer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-v8-r1-test-db-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exposes an npm script that initializes an isolated test DB from Prisma schema only', () => {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    expect(pkg.scripts['db:init:test']).toBe('node scripts/init-test-db.js');

    const script = fs.readFileSync(initScriptPath, 'utf8');
    expect(script).toContain('prisma db push');
    expect(script).not.toContain('copyFileSync');
    expect(script).not.toContain('data/nexus.db');
    expect(script).not.toContain('prisma/data/nexus.db');
  });

  test('creates a clean checkout reproducible DB with task_group_id and Prisma can write grouped tasks', async () => {
    const dbPath = path.join(tmpDir, 'v8-r1-test.db');
    const stdout = execFileSync('npm', ['run', 'db:init:test', '--', dbPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: undefined },
    });
    const jsonLine = stdout.trim().split('\n').find((line) => line.trim().startsWith('{'));
    expect(jsonLine).toBeTruthy();
    const result = JSON.parse(jsonLine as string);
    expect(result).toMatchObject({ ok: true, db_path: dbPath, schema_source: 'prisma/schema.prisma' });
    expect(fs.existsSync(dbPath)).toBe(true);

    const dbUrl = `file:${dbPath}`;
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const columns = await prisma.$queryRaw<Array<{ name: string }>>`PRAGMA table_info(nexus_tasks);`;
      expect(columns.map((column) => column.name)).toContain('task_group_id');

      const project = await prisma.project.create({
        data: { name: 'v8-r1-test-project', status: 'active' },
      });
      const taskGroup = await prisma.taskGroup.create({
        data: {
          project_id: project.id,
          group_id: 'v8-r1-test-group',
          name: 'V8 R1 Test Group',
        },
      });
      const task = await prisma.task.create({
        data: {
          project_id: project.id,
          title: 'Grouped task insert smoke',
          objective: 'Prove task_group_id exists in migration-initialized test DB',
          lane_required: 'DEV',
          task_group_id: taskGroup.id,
        },
      });

      expect(task.task_group_id).toBe(taskGroup.id);
    } finally {
      await prisma.$disconnect();
    }
  }, 30000);

  test('refuses to initialize known production or ignored SQLite paths', () => {
    for (const forbiddenPath of ['data/nexus.db', 'prisma/data/nexus.db']) {
      expect(() =>
        execFileSync('node', ['scripts/init-test-db.js', forbiddenPath], {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio: 'pipe',
        }),
      ).toThrow(/Refusing to initialize forbidden DB path/);
    }
  });
});
