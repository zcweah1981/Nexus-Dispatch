# Admin 指南

[English](./admin-guide.md)

---

## 目標

本指南說明如何在不破壞 API-only 邊界的前提下，安全操作 Nexus Dispatch 的 WebUI 與 Runtime API 可視層。

## 目前 public 產品中的 admin 範圍

目前 public WebUI 的管理員範圍刻意收斂為：
- Runtime 可見性
- 少量 API 支援的受控動作預覽
- 唯讀設定與策略查看
- 安全 proof 暴露

它**不是**一個寬權限瀏覽器後台。

## 管理員應重點使用的頁面

### 專案設定
- 展示由 Runtime API 返回的唯讀專案設定
- 適合確認 visible language 與策略狀態
- 不用於查看 secrets 或原始 env 值

### 受控動作
- 展示 preview → validation → confirm → result → audit reference 的流程
- 目前低風險寫入路徑必須明確走 API
- 部分卡片仍是 preview-only，直到對應的 controlled API 完成

### 可觀測性
- 展示 API、daemon、worker heartbeat、failed runs、report / artifact / event 計數
- 當你需要先確認控制平面是否健康，優先看這裡

### 發布中心
- 對外回報前，先在這裡確認可見報告是否真正就緒
- `run completed` 不等於對外交付完成

## Review policy 與 cron registry

public admin 認知必須與真實產品邊界一致：

- Review policy 是專案級 Runtime 資料
- `project_cronjobs` 中的 cron 行只是**註冊表記錄**，不代表真實外部排程器一定正在運行
- Telegram 專案選擇不會自動啟停 cronjob
- Daemon 的狀態驅動仍必須走 Runtime API 邊界

## 安全管理員檢查單

在判斷專案健康前，至少確認：
- [ ] API 狀態健康
- [ ] 佇列深度可解釋
- [ ] 已檢查阻塞 / 死信數量
- [ ] 已在發布中心檢查 pending reports
- [ ] Proof 治理頁面已確認僅展示安全摘要
- [ ] 沒有人把瀏覽器可見資訊當作完整證據替代品

## 管理員不應做的事

- 不要繞過 Runtime API 直接操作 SQLite
- 不要把 endpoint display ref 當成真實憑據
- 不要在公開截圖裡暴露 raw proof、run ID、chat ID、token
- 不要因為 registry 有列就宣稱 cron 自動化一定在運行

## 何時離開 WebUI

遇到以下情境，應切換到更深的 Runtime/API 證據層：
- 查看原始 proof payload
- 查看比可見摘要更深的 audit 事件
- 排查服務重啟 / 部署問題
- 調試 scheduler adapter
- 排查資料庫 / schema 問題

## 相關指南

- [WebUI Guide](./webui-guide.md)
- [Release Center Guide](./release-center-guide.md)
- [Proof Governance Guide](./proof-governance-guide.md)
- [API-only Safety Boundary](./api-only-safety.md)
