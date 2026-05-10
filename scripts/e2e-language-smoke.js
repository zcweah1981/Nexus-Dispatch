#!/usr/bin/env node
/**
 * R12-T5 E2E Language Setting Smoke Test
 * Validates zh-CN and en-US visible message formatting end-to-end.
 */
const { formatV8VisibleMessage } = require('../dist/src/reports/v8_visible_message_formatter');

// === zh-CN: dispatch (接单) ===
const zhDispatch = formatV8VisibleMessage({
  message_type: 'agent_dispatch',
  payload_json: {
    project_id: 'nexus-dispatch',
    task_id: 'task-r12-e2e-zh',
    run_id: 'run-r12-e2e-zh',
    trace_id: 'trace-r12-e2e-zh',
    agent_id: 'long-coder-1',
    task: { title: 'R12-T5 中文接单验证' },
  },
});

// === zh-CN: result (回报) ===
const zhResult = formatV8VisibleMessage({
  message_type: 'agent_result',
  summary: '结果：完成\n说明：端到端验证通过\n验证：110/110 tests passed',
  payload_json: {
    task_id: 'task-r12-e2e-zh',
    run_id: 'run-r12-e2e-zh',
    result: 'completed',
    task: { title: 'R12-T5 中文回报验证' },
  },
});

// === en-US: dispatch ===
const enDispatch = formatV8VisibleMessage({
  message_type: 'agent_dispatch',
  visible_language: 'en-US',
  payload_json: {
    project_id: 'nexus-dispatch',
    task_id: 'task-r12-e2e-en',
    run_id: 'run-r12-e2e-en',
    trace_id: 'trace-r12-e2e-en',
    agent_id: 'hyoga-coder-1',
    task: { title: 'R12-T5 English dispatch validation' },
  },
});

// === en-US: result ===
const enResult = formatV8VisibleMessage({
  message_type: 'agent_result',
  visible_language: 'en-US',
  summary: 'Result: done\nDescription: e2e validated\nValidation: 110/110 tests passed',
  payload_json: {
    task_id: 'task-r12-e2e-en',
    run_id: 'run-r12-e2e-en',
    result: 'completed',
    task: { title: 'R12-T5 English report validation' },
  },
});

// === Sensitive redaction ===
const sensitiveResult = formatV8VisibleMessage({
  message_type: 'agent_result',
  summary: '结果：完成\n验证：Bearer sk-orig-secret-token 和 chat_id: -1001234567890 已处理',
  payload_json: { task: { title: '敏感信息检查' } },
});

// === Output ===
console.log('═══ ZH-CN DISPATCH ═══');
console.log(zhDispatch);
console.log();
console.log('═══ ZH-CN RESULT ═══');
console.log(zhResult);
console.log();
console.log('═══ EN-US DISPATCH ═══');
console.log(enDispatch);
console.log();
console.log('═══ EN-US RESULT ═══');
console.log(enResult);
console.log();
console.log('═══ SENSITIVE REDACTION ═══');
console.log(sensitiveResult);
console.log();

// === Checks ===
const checks = {
  zh_dispatch_has_jiedan: zhDispatch.includes('【接单】'),
  zh_dispatch_has_task_title: zhDispatch.includes('R12-T5 中文接单验证'),
  zh_dispatch_has_owner: zhDispatch.includes('执行：Long'),
  zh_result_has_huibao: zhResult.includes('【回报】'),
  zh_result_has_task: zhResult.includes('R12-T5 中文回报验证'),
  zh_no_runtime_ids: !zhDispatch.match(/task-r12-e2e-zh|run-r12-e2e-zh|trace-r12-e2e-zh|project_id|nexus-dispatch/),
  en_dispatch_has_accepted: enDispatch.includes('[Task accepted]'),
  en_dispatch_has_task: enDispatch.includes('R12-T5 English dispatch validation'),
  en_dispatch_has_owner: enDispatch.includes('Owner: Hyoga'),
  en_result_has_report: enResult.includes('[Report]'),
  en_result_has_task: enResult.includes('R12-T5 English report validation'),
  en_no_chinese: !enDispatch.match(/[接回执审组总]/) && !enResult.match(/[接回执审组总]/),
  sensitive_redacted: !sensitiveResult.match(/sk-orig|-1001234567890/),
  sensitive_has_marker: sensitiveResult.includes('[redacted]'),
};

console.log('═══ VALIDATION CHECKS ═══');
let allPass = true;
for (const [key, value] of Object.entries(checks)) {
  const mark = value ? '✅' : '❌';
  console.log(`  ${mark} ${key}: ${value}`);
  if (!value) allPass = false;
}
console.log();
console.log(allPass ? '✅ ALL E2E CHECKS PASSED' : '❌ SOME CHECKS FAILED');
process.exit(allPass ? 0 : 1);
