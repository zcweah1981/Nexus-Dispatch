import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { ProjectCronjobRepository, ProjectRepository } from '../../src/repositories/v8';

const repoRoot = path.resolve(__dirname, '../..');

describe('V8-R7 watchdog/patrol prompt template contracts', () => {
  let tmpDir: string;
  let prisma: PrismaClient;
  let projectRepo: ProjectRepository;
  let cronjobRepo: ProjectCronjobRepository;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-v8-r7-prompt-'));
    const dbPath = path.join(tmpDir, 'prompt-test.db');
    execFileSync('npm', ['run', 'db:init:test', '--', dbPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: undefined },
    });
    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    projectRepo = new ProjectRepository(prisma);
    cronjobRepo = new ProjectCronjobRepository(prisma);
  }, 30000);

  afterEach(async () => {
    await prisma.$disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('renders a project-scoped watchdog prompt from config_json.prompt_template with read-only guardrails', async () => {
    const projectA = await projectRepo.create({ name: 'prompt-project-a' });
    const projectB = await projectRepo.create({ name: 'prompt-project-b' });

    await cronjobRepo.bind(projectA.id, {
      cronjob_id: 'watchdog-hourly',
      name: 'Hourly Watchdog',
      schedule: '0 * * * *',
      status: 'active',
      config_json: {
        prompt_template: '巡检 {{project_id}} / {{cronjob_id}} at {{now_iso}}；模式={{mode}}；maintenance={{maintenance_mode}}',
      },
    });
    await cronjobRepo.bind(projectB.id, {
      cronjob_id: 'watchdog-hourly',
      name: 'Other Watchdog',
      schedule: '0 * * * *',
      status: 'active',
      config_json: {
        prompt_template: 'wrong project {{project_id}}',
      },
    });

    const prompt = await cronjobRepo.renderPrompt(projectA.id, 'watchdog-hourly', {
      mode: 'watchdog',
      now: new Date('2026-05-09T12:34:56.000Z'),
      maintenance: false,
    });

    expect(prompt).toContain('巡检 ' + projectA.id + ' / watchdog-hourly at 2026-05-09T12:34:56.000Z');
    expect(prompt).toContain('模式=watchdog；maintenance=false');
    expect(prompt).toContain('只读巡检');
    expect(prompt).toContain('不得自动修复');
    expect(prompt).not.toContain(projectB.id);
    expect(prompt).not.toContain('{{');
  });

  test('uses a safe default patrol template and rejects unknown template variables', async () => {
    const project = await projectRepo.create({ name: 'prompt-default-project' });
    await cronjobRepo.bind(project.id, {
      cronjob_id: 'patrol-default',
      name: 'Default Patrol',
      schedule: '*/15 * * * *',
      status: 'active',
      config_json: { mode: 'patrol' },
    });
    await cronjobRepo.bind(project.id, {
      cronjob_id: 'patrol-bad-template',
      name: 'Bad Patrol',
      schedule: '*/15 * * * *',
      status: 'active',
      config_json: { prompt_template: 'bad {{secret_token}}' },
    });

    const prompt = await cronjobRepo.renderPrompt(project.id, 'patrol-default', {
      mode: 'patrol',
      now: new Date('2026-05-09T00:00:00.000Z'),
      maintenance: true,
    });

    expect(prompt).toContain(`项目：${project.id}`);
    expect(prompt).toContain('任务：patrol-default');
    expect(prompt).toContain('模式：patrol');
    expect(prompt).toContain('maintenance：true');
    expect(prompt).toContain('只读巡检');
    expect(prompt).toContain('不得自动修复');

    await expect(cronjobRepo.renderPrompt(project.id, 'patrol-bad-template', {
      mode: 'patrol',
      now: new Date('2026-05-09T00:00:00.000Z'),
    })).rejects.toThrow(/Unknown prompt template variable: secret_token/);
  });
});
