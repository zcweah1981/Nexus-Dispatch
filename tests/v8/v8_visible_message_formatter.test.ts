import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { formatV8VisibleMessage } from '../../src/reports/v8_visible_message_formatter';
import { V8RuntimeApiService } from '../../src/services/v8_runtime_api_service';

const repoRoot = path.resolve(__dirname, '../..');

describe('V8-R6 visible message formatter', () => {
  test('formats agent dispatch as human-readable text without runtime identifiers or auto acceptance copy', () => {
    const text = formatV8VisibleMessage({
      message_type: 'agent_dispatch',
      summary: 'Dispatched task-r6-visible to registered endpoint long-coder-1',
      payload_json: {
        project_id: 'nexus-dispatch',
        task_id: 'task-r6-visible',
        dispatch_id: 'dispatch-secret-1',
        run_id: 'run-secret-1',
        trace_id: 'trace-secret-1',
        worker_run_id: 'worker-secret-1',
        endpoint: 'https://worker.example/v1/chat/completions',
        agent_id: 'long-coder-1',
        task: {
          title: 'R6-T2 visible message formatter',
          lane_required: 'DEV',
          acceptance_mode: 'auto',
          reviewer: 'shun-designer-1',
        },
      },
    });

    expect(text).toContain('【接单】');
    expect(text).toContain('任务：R6-T2 visible message formatter');
    expect(text).toContain('执行：Long');
    expect(text).toContain('验收：PM 审核后确认');
    expect(text).toContain('Proof 已存系统');
    expect(text).not.toContain('验收：auto');
    expect(text).not.toMatch(/task-r6-visible|dispatch-secret-1|run-secret-1|trace-secret-1|worker-secret-1|https:\/\/worker\.example|\{|\}|project_id|task_id|dispatch_id|run_id|trace_id|worker_run_id/);
  });

  test('formats agent result as short visible proof summary while hiding raw proof payload', () => {
    const text = formatV8VisibleMessage({
      message_type: 'agent_result',
      summary: '结果：已完成首版\n说明：实现用户可见消息格式\n验证：npm test -- --runInBand tests/v8/v8_visible_message_formatter.test.ts -> passed',
      payload_json: {
        project_id: 'nexus-dispatch',
        task_id: 'task-r6-visible',
        run_id: 'run-secret-2',
        worker_run_id: 'worker-secret-2',
        trace_id: 'trace-secret-2',
        result: 'completed',
        proof: {
          commands: ['npm test -- --runInBand tests/v8/v8_visible_message_formatter.test.ts'],
          raw_json: { should_not_leak: true },
        },
        task: { title: 'R6-T2 visible message formatter', lane_required: 'DEV' },
      },
    });

    expect(text).toContain('【回报】');
    expect(text).toContain('任务：R6-T2 visible message formatter');
    expect(text).toContain('结果：已完成首版');
    expect(text).toContain('说明：实现用户可见消息格式');
    expect(text).toContain('验证：npm test -- --runInBand tests/v8/v8_visible_message_formatter.test.ts -> passed');
    expect(text).toContain('Proof 已存系统');
    expect(text).not.toMatch(/task-r6-visible|run-secret-2|worker-secret-2|trace-secret-2|\{|\}|raw_json|should_not_leak|project_id|task_id|run_id|worker_run_id|trace_id/);
  });

  test('formats review result verdict without leaking review identifiers', () => {
    const text = formatV8VisibleMessage({
      message_type: 'review_result',
      summary: '结论：不通过\n原因：仍显示自动验收文案\n返工：改为 PM 审核后确认\n下一步：Long 返工',
      payload_json: {
        project_id: 'nexus-dispatch',
        original_task_id: 'task-r6-visible',
        review_task_id: 'task-r6-visible-review',
        reviewer: 'shun-designer-1',
        verdict: 'fail',
        trace_id: 'trace-secret-3',
      },
    });

    expect(text).toContain('【审核】');
    expect(text).toContain('审核：Shun');
    expect(text).toContain('结论：审核不通过');
    expect(text).toContain('原因：仍显示自动验收文案');
    expect(text).toContain('返工：改为 PM 审核后确认');
    expect(text).toContain('下一步：Long 返工');
    expect(text).toContain('Proof 已存系统');
    expect(text).not.toMatch(/task-r6-visible|task-r6-visible-review|trace-secret-3|original_task_id|review_task_id|trace_id|\{|\}/);
  });

  test('redacts sensitive credentials and chat identifiers from visible report text', () => {
    const text = formatV8VisibleMessage({
      message_type: 'agent_result',
      summary: [
        '结果：已完成',
        '说明：调用凭据 fake_secret_alpha 和 Bearer fake_bearer_beta 已放入 proof',
        '验证：Authorization: fake_header_gamma 且 chat_id: -1001234567890 -> passed',
        '额外：token=555555:ABC-DEF1234ghIkl-zyx987、sk-orig_secret_key_12345、ghp_my_github_token_xyz、xoxb-slack-token-abc',
      ].join('\n'),
      payload_json: {
        task: { title: 'R6-T4 sensitive redaction' },
      },
    });

    expect(text).toContain('【回报】');
    expect(text).toContain('任务：R6-T4 sensitive redaction');
    expect(text).toContain('[redacted]');
    expect(text).toContain('Proof 已存系统');
    expect(text).not.toMatch(/fake_secret_alpha|fake_bearer_beta|fake_header_gamma|-1001234567890|555555:ABC-DEF|sk-orig|ghp_|xoxb-/);
  });

  test('Runtime report creation redacts sensitive values from summary while preserving raw payload in proof storage', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-v8-r6-redaction-'));
    const dbPath = path.join(tmpDir, 'redaction.db');
    execFileSync('npm', ['run', 'db:init:test', '--', dbPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: undefined },
    });
    const prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    try {
      const service = new V8RuntimeApiService(prisma);
      const project = await service.createProject({ id: 'project-r6-redaction', name: 'R6 redaction project' });
      const task = await service.createTask(project.id, {
        id: 'task-r6-redaction-runtime',
        title: 'R6 redaction runtime contract',
        objective: 'Visible report summary must redact sensitive values',
        lane_required: 'DEV',
        acceptance_mode: 'pm_audit',
      });

      const report = await service.createReport(project.id, {
        task_id: task.id,
        message_type: 'agent_result',
        status: 'pending',
        summary: '结果：已完成\n说明：包含 fake_secret_runtime\n验证：fake_header_runtime -> passed',
        payload_json: {
          task: { title: task.title },
          proof_notes: 'fake_secret_runtime fake_header_runtime',
        },
      });

      expect(report.summary).toContain('【回报】');
      expect(report.summary).toContain('任务：R6 redaction runtime contract');
      expect(report.summary).toContain('[redacted]');
      expect(report.summary).not.toMatch(/fake_secret_runtime|fake_header_runtime/);
      expect(JSON.parse(report.payload_json)).toMatchObject({ proof_notes: 'fake_secret_runtime fake_header_runtime' });
    } finally {
      await prisma.$disconnect();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30000);

  test('localizes dispatch/report/review/group visible messages to en-US without leaking runtime keys', () => {
    const forbidden = /project_id|task_id|run_id|trace_id|worker_run_id|payload_json|raw proof|secret|nexus-dispatch|task-r12-visible|run-r12-visible|trace-r12-visible|worker-r12-visible|\{|\}/i;

    const dispatch = formatV8VisibleMessage({
      message_type: 'agent_dispatch',
      locale: 'en-US',
      summary: 'Dispatched task-r12-visible with trace_id trace-r12-visible',
      payload_json: {
        project_id: 'nexus-dispatch',
        task_id: 'task-r12-visible',
        run_id: 'run-r12-visible',
        trace_id: 'trace-r12-visible',
        worker_run_id: 'worker-r12-visible',
        payload_json: { raw: true },
        agent_id: 'long-coder-1',
        task: { title: 'R12 visible language formatter' },
      },
    });
    expect(dispatch).toContain('Task accepted');
    expect(dispatch).toContain('Task: R12 visible language formatter');
    expect(dispatch).toContain('Owner: Long');
    expect(dispatch).toContain('Proof stored in system');
    expect(dispatch).not.toMatch(forbidden);

    const report = formatV8VisibleMessage({
      message_type: 'agent_result',
      locale: 'en-US',
      summary: 'Result: completed\nDescription: formatter localized\nValidation: npm test -> passed with task_id task-r12-visible',
      payload_json: { task: { title: 'R12 visible language formatter' }, secret: 'fake_secret_r12' },
    });
    expect(report).toContain('Report');
    expect(report).toContain('Result: completed');
    expect(report).toContain('Description: formatter localized');
    expect(report).toContain('Validation: npm test -> passed with [hidden] [hidden]');
    expect(report).toContain('Proof stored in system');
    expect(report).not.toMatch(forbidden);

    const review = formatV8VisibleMessage({
      message_type: 'review_result',
      locale: 'en-US',
      summary: 'Verdict: approved\nReason: meets acceptance\nNext: close group',
      payload_json: { reviewer: 'shun-designer-1', verdict: 'pass', trace_id: 'trace-r12-visible' },
    });
    expect(review).toContain('Review');
    expect(review).toContain('Reviewer: Shun');
    expect(review).toContain('Verdict: approved');
    expect(review).toContain('Proof stored in system');
    expect(review).not.toMatch(forbidden);

    const group = formatV8VisibleMessage({
      message_type: 'group_summary',
      locale: 'en-US',
      summary: 'Group r12-group closeout: 3/3 completed with raw proof',
      payload_json: {
        project_id: 'nexus-dispatch',
        task_group_id: 'tg-r12-visible',
        group_id: 'r12-group',
        group_title: 'R12 visible language',
        total: 3,
        completed: 3,
        failed: 0,
        payload_json: { raw: 'proof' },
      },
    });
    expect(group).toContain('Group closeout');
    expect(group).toContain('Group: R12 visible language');
    expect(group).toContain('Progress: 3/3 completed');
    expect(group).toContain('Proof stored in system');
    expect(group).not.toMatch(forbidden);
  });

  test('keeps zh-CN visible copy as the default locale for dispatch/report/review/group summaries', () => {
    const group = formatV8VisibleMessage({
      message_type: 'group_summary',
      summary: 'Group r12-group closeout: 2/2 completed',
      payload_json: {
        project_id: 'nexus-dispatch',
        task_group_id: 'tg-r12-visible',
        group_title: 'R12 可见语言',
        total: 2,
        completed: 2,
      },
    });

    expect(formatV8VisibleMessage({ message_type: 'agent_dispatch', payload_json: { task: { title: '中文默认派单' } } })).toContain('【接单】');
    expect(formatV8VisibleMessage({ message_type: 'agent_result', payload_json: { task: { title: '中文默认回报' } } })).toContain('【回报】');
    expect(formatV8VisibleMessage({ message_type: 'review_result', payload_json: { reviewer: 'shun-designer-1' } })).toContain('【审核】');
    expect(group).toContain('【组总结】');
    expect(group).toContain('组：R12 可见语言');
    expect(group).toContain('进度：2/2 已完成');
    expect(group).toContain('Proof 已存系统');
    expect(group).not.toMatch(/project_id|task_group_id|group_id|payload_json|\{|\}/);
  });

  test('Runtime report creation stores formatted visible summary and keeps raw payload only in payload_json', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-v8-r6-visible-'));
    const dbPath = path.join(tmpDir, 'visible.db');
    execFileSync('npm', ['run', 'db:init:test', '--', dbPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: undefined },
    });
    const prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    try {
      const service = new V8RuntimeApiService(prisma);
      const project = await service.createProject({ id: 'project-r6-visible', name: 'R6 visible project' });
      const task = await service.createTask(project.id, {
        id: 'task-r6-visible-runtime',
        title: 'R6 visible formatter runtime contract',
        objective: 'Visible report summary must be human-readable',
        lane_required: 'DEV',
        acceptance_mode: 'auto',
      });

      const report = await service.createReport(project.id, {
        task_id: task.id,
        message_type: 'agent_dispatch',
        status: 'pending',
        summary: 'Dispatched task-r6-visible-runtime to registered endpoint long-coder-1',
        payload_json: {
          project_id: project.id,
          task_id: task.id,
          run_id: 'run-secret-runtime',
          dispatch_id: 'dispatch-secret-runtime',
          trace_id: 'trace-secret-runtime',
          agent_id: 'long-coder-1',
          endpoint: 'https://worker.example/v1/chat/completions',
          task: { title: task.title, acceptance_mode: 'auto' },
        },
      });

      expect(report.summary).toContain('【接单】');
      expect(report.summary).toContain('任务：R6 visible formatter runtime contract');
      expect(report.summary).toContain('执行：Long');
      expect(report.summary).toContain('验收：PM 审核后确认');
      expect(report.summary).toContain('Proof 已存系统');
      expect(report.summary).not.toContain('验收：auto');
      expect(report.summary).not.toMatch(/task-r6-visible-runtime|run-secret-runtime|dispatch-secret-runtime|trace-secret-runtime|https:\/\/worker\.example|project_id|task_id|run_id|dispatch_id|trace_id|\{|\}/);
      expect(JSON.parse(report.payload_json)).toMatchObject({ task_id: task.id, run_id: 'run-secret-runtime' });
    } finally {
      await prisma.$disconnect();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30000);
});
