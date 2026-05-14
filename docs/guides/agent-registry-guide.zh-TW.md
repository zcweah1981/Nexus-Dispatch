# Agent 註冊表指南

[English](./agent-registry-guide.md)

---

## 目標

本指南說明如何閱讀 Nexus Dispatch 的 Agent 註冊表頁面。

## 頁面展示什麼

每張卡片展示：
- `agent_id`
- lane
- dialect
- status
- endpoint display reference

## 頁面不展示什麼

不會暴露：
- 原始 endpoint 憑據
- Worker 主機上的本機檔案路徑
- bot token / chat ID
- 原始 agent payload JSON

endpoint ref 只是脫敏後的顯示引用。

## 欄位如何理解

### Agent ID
用於派單路由與 proof 歸因的穩定邏輯身份。

### Lane
對應的工作 lane，例如：
- DEV
- OPS
- DESIGN
- CONTENT
- RESEARCH
- ORCHESTRATOR

### Dialect
執行風格 / 配接器類型，例如 Hermes 或 OpenClaw。

### Status
用於操作層判斷的高層可用性訊號。
它不能取代更深層的 Worker 健康診斷。

### Endpoint display ref
幫助操作者區分不同 Worker 的安全提示值，不暴露真實連線秘密。

## 推薦使用情境

適合回答：
- 這個 lane 由誰負責？
- 某個 lane 是否已經有 Worker 覆蓋？
- 目前接入的是哪種 dialect？
- 哪個 agent 看起來離線或陳舊？

## 不推薦的使用方式

不要把 Agent 註冊表當作：
- secret 管理頁面
- transport 調試台
- Worker 立即可成功執行的最終證明

更深層檢查應結合：
- Dispatch Live
- Observability
- Runtime API agent list

## 操作提示

註冊表是可讀性層。真正的權威仍在 Runtime API 與專案級調度邏輯中。
