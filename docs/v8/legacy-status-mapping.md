# V8 Legacy Status Mapping

本文件只用于迁移说明；以下状态不得进入 V8 新主流程的状态枚举或 transition matrix。

| Legacy status | V8 replacement | 说明 |
|---|---|---|
| `validating` | `task.completion_pending` | Worker 回报完成后进入 proof/acceptance gate。 |
| `review_spawned` | `task.review_pending` | 审核任务生成后，原任务等待审核结论。 |
| `failed` | `run.error` / `report.error` / `task.retry_ready` or `task.dead_letter` | V8 按实体拆分失败语义：执行/报告用 `error`，任务按重试策略进入 `retry_ready` 或 `dead_letter`。 |

R2 Runtime API / FSM Controller 只能消费 V8 状态枚举与 matrix；遇到 legacy 状态必须先按本表迁移/归一化，再进入新主流程。
