export type V8VisibleLanguage = 'zh-CN' | 'en-US';

export interface V8VisibleMessageInput {
  message_type: string;
  summary?: string | null;
  payload_json?: unknown;
  visible_language?: V8VisibleLanguage;
  locale?: V8VisibleLanguage;
}

type JsonObject = Record<string, unknown>;

const FORBIDDEN_RUNTIME_KEY_RE = /\b(project_id|task_id|task_group_id|group_id|dispatch_id|run_id|trace_id|worker_run_id|payload_json|original_task_id|review_task_id|reporter_task_id)\b/gi;
const FORBIDDEN_RUNTIME_VALUE_RE = /\b(?:task|run|dispatch|trace|worker|tg)-[A-Za-z0-9_.:-]+\b/g;
const RAW_PROOF_RE = /raw\s+proof/gi;
const SENSITIVE_LABEL_VALUE_RE = /\b(?:authorization|api[_-]?key|token|secret|chat[_-]?id|bot[_-]?token)\b\s*[:=：]\s*\S+/gi;
const BEARER_VALUE_RE = /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/gi;
const COMMON_SECRET_VALUE_RE = /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|\d{6,}:[A-Za-z0-9_-]{20,}|-100\d{8,})\b/g;
const SENSITIVE_VALUE_RE = /\bfake_(?:secret|bearer|header|chat)_[A-Za-z0-9_.:-]+\b/g;
const URL_RE = /https?:\/\/\S+/g;
const RAW_BRACE_RE = /[{}]/g;

const AGENT_LABELS: Record<string, string> = {
  'long-coder-1': 'Long',
  'shun-designer-1': 'Shun',
  'hyoga-coder-1': 'Hyoga',
  'ikki-coder-1': 'Ikki',
  'mu-designer-1': 'Mu',
  'seiya-coder-1': 'Seiya',
};

function asObject(value: unknown): JsonObject {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonObject : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function nestedObject(root: JsonObject, key: string): JsonObject {
  return asObject(root[key]);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function agentLabel(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  return AGENT_LABELS[raw] ?? (raw ? raw.replace(/-.*/, '').replace(/^./, (c) => c.toUpperCase()) : '待确认');
}

function parseSummary(summary?: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of (summary ?? '').split(/\r?\n/)) {
    const match = line.trim().match(/^([^：:]{1,12})[：:]\s*(.+)$/);
    if (match) result[match[1].trim()] = match[2].trim();
  }
  return result;
}

function clip(value: string | undefined, fallback: string, max = 120): string {
  const source = (value ?? '').replace(/\s+/g, ' ').trim() || fallback;
  return source.length > max ? `${source.slice(0, max - 1)}…` : source;
}

function verdictLabel(payload: JsonObject, summaryFields: Record<string, string>): string {
  const source = `${firstString(payload.verdict, summaryFields['结论'], summaryFields['结果']) ?? ''}`.toLowerCase();
  if (/不通过|未通过|退回|fail|reject|changes[ _-]?requested/.test(source)) return '审核不通过';
  if (/通过|pass|approved/.test(source)) return '审核通过';
  return '待审核';
}

function sanitizeVisibleText(text: string): string {
  return text
    .replace(/验收[：:]\s*auto/gi, '验收：PM 审核后确认')
    .replace(URL_RE, '[endpoint hidden]')
    .replace(SENSITIVE_LABEL_VALUE_RE, '[redacted]')
    .replace(BEARER_VALUE_RE, '[redacted]')
    .replace(COMMON_SECRET_VALUE_RE, '[redacted]')
    .replace(SENSITIVE_VALUE_RE, '[redacted]')
    .replace(RAW_PROOF_RE, 'system proof')
    .replace(FORBIDDEN_RUNTIME_KEY_RE, '[hidden]')
    .replace(FORBIDDEN_RUNTIME_VALUE_RE, '[hidden]')
    .replace(RAW_BRACE_RE, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function formatDispatch(payload: JsonObject, summary?: string | null, language: V8VisibleLanguage = 'zh-CN'): string {
  const task = nestedObject(payload, 'task');
  const title = clip(firstString(task.title, payload.title, summary), language === 'en-US' ? 'New task' : '新任务');
  const owner = agentLabel(firstString(payload.agent_id, nestedObject(payload, 'agent').agent_id));
  const acceptance = 'PM 审核后确认';
  if (language === 'en-US') {
    return sanitizeVisibleText([
      '[Task accepted]',
      `Task: ${title}`,
      `Owner: ${owner}`,
      'Acceptance: PM review required',
      'Next: executor agent works and returns structured proof',
      'Proof stored in system',
    ].join('\n'));
  }
  return sanitizeVisibleText([
    '【接单】',
    `任务：${title}`,
    `执行：${owner}`,
    `验收：${acceptance}`,
    '下一步：执行 Agent 处理并回传结构化 proof',
    'Proof 已存系统',
  ].join('\n'));
}

function formatResult(payload: JsonObject, summary?: string | null, language: V8VisibleLanguage = 'zh-CN'): string {
  const fields = parseSummary(summary);
  const task = nestedObject(payload, 'task');
  const title = clip(firstString(task.title, payload.title), language === 'en-US' ? 'Current task' : '当前任务');
  if (language === 'en-US') {
    return sanitizeVisibleText([
      '[Report]',
      `Task: ${title}`,
      `Result: ${clip(fields.Result ?? fields['结果'] ?? firstString(payload.result, summary), 'Reported')}`,
      `Description: ${clip(fields.Description ?? fields.Summary ?? fields['说明'] ?? fields['摘要'] ?? firstString(payload.description), 'See system proof')}`,
      `Validation: ${clip(fields.Validation ?? fields['验证'] ?? firstString(payload.validation), 'Proof stored in system')}`,
      'Risk: no new blocker observed',
      'Next: wait for PM/Reviewer review',
      'Proof stored in system',
    ].join('\n'));
  }
  return sanitizeVisibleText([
    '【回报】',
    `任务：${title}`,
    `结果：${clip(fields['结果'] ?? firstString(payload.result, summary), '已回报')}`,
    `说明：${clip(fields['说明'] ?? fields['摘要'] ?? firstString(payload.description), '详见系统 proof')}`,
    `验证：${clip(fields['验证'] ?? firstString(payload.validation), 'Proof 已存系统')}`,
    '风险：未见新增阻塞',
    '下一步：等待 PM/Reviewer 审核',
    'Proof 已存系统',
  ].join('\n'));
}

function formatReview(payload: JsonObject, summary?: string | null, language: V8VisibleLanguage = 'zh-CN'): string {
  const fields = parseSummary(summary);
  if (language === 'en-US') {
    return sanitizeVisibleText([
      '[Review]',
      `Reviewer: ${agentLabel(firstString(payload.reviewer, payload.reviewer_agent_id))}`,
      `Verdict: ${verdictLabel(payload, fields) === '审核通过' ? 'approved' : verdictLabel(payload, fields) === '审核不通过' ? 'changes requested' : 'pending review'}`,
      `Reason: ${clip(fields.Reason ?? fields['原因'] ?? fields['不通过原因'] ?? firstString(payload.reason), 'See system proof')}`,
      `Rework: ${clip(fields.Rework ?? fields['返工'] ?? fields['返工动作'] ?? firstString(payload.rework), 'Follow review instructions')}`,
      `Next: ${clip(fields.Next ?? fields['下一步'] ?? firstString(payload.next_step), 'Wait for responsible owner')}`,
      'Proof stored in system',
    ].join('\n'));
  }
  return sanitizeVisibleText([
    '【审核】',
    `审核：${agentLabel(firstString(payload.reviewer, payload.reviewer_agent_id))}`,
    `结论：${verdictLabel(payload, fields)}`,
    `原因：${clip(fields['原因'] ?? fields['不通过原因'] ?? firstString(payload.reason), '详见系统 proof')}`,
    `返工：${clip(fields['返工'] ?? fields['返工动作'] ?? firstString(payload.rework), '按审核意见处理')}`,
    `下一步：${clip(fields['下一步'] ?? firstString(payload.next_step), '等待责任人处理')}`,
    'Proof 已存系统',
  ].join('\n'));
}

function numberField(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function formatGroupSummary(payload: JsonObject, summary?: string | null, language: V8VisibleLanguage = 'zh-CN'): string {
  const total = numberField(payload.total, 0);
  const completed = numberField(payload.completed, total);
  const failed = numberField(payload.failed, 0);
  const groupTitle = clip(firstString(payload.group_title, payload.name, summary), language === 'en-US' ? 'Current group' : '当前任务组');
  if (language === 'en-US') {
    return sanitizeVisibleText([
      '[Group closeout]',
      `Group: ${groupTitle}`,
      `Progress: ${completed}/${total || completed} completed`,
      `Result: ${failed > 0 ? `${failed} failed, review required` : 'all tracked tasks completed'}`,
      'Next: continue with the next ready group',
      'Proof stored in system',
    ].join('\n'));
  }
  return sanitizeVisibleText([
    '【组总结】',
    `组：${groupTitle}`,
    `进度：${completed}/${total || completed} 已完成`,
    `结果：${failed > 0 ? `${failed} 个任务需处理` : '已完成本组可追踪任务'}`,
    '下一步：继续处理下一组就绪任务',
    'Proof 已存系统',
  ].join('\n'));
}

export function formatV8VisibleMessage(input: V8VisibleMessageInput): string {
  const payload = asObject(input.payload_json);
  const language = input.visible_language ?? input.locale ?? 'zh-CN';
  if (input.message_type === 'agent_dispatch') return formatDispatch(payload, input.summary, language);
  if (input.message_type === 'agent_result') return formatResult(payload, input.summary, language);
  if (input.message_type === 'review_result' || input.message_type === 'review_accepted' || input.message_type === 'pm_acceptance') {
    return formatReview(payload, input.summary, language);
  }
  if (input.message_type === 'group_summary' || input.message_type === 'group_closeout') return formatGroupSummary(payload, input.summary, language);
  if (language === 'en-US') {
    return sanitizeVisibleText([
      '[Notice]',
      `Type: ${input.message_type}`,
      `Description: ${clip(input.summary ?? undefined, 'See system proof')}`,
      'Proof stored in system',
    ].join('\n'));
  }
  return sanitizeVisibleText([
    '【通知】',
    `类型：${input.message_type}`,
    `说明：${clip(input.summary ?? undefined, '详见系统 proof')}`,
    'Proof 已存系统',
  ].join('\n'));
}
