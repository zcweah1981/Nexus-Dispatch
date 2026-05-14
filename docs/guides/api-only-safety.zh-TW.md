# API-only 安全邊界

[English](./api-only-safety.md)

---

## 核心規則

在 Nexus Dispatch 中，Worker、WebUI、Daemon 都**不能**直接開啟 SQLite。

SQLite / Prisma 存取權只屬於 API Server。

## 為什麼要這樣設計

這樣才能保持產品治理模型一致：
- 單一權威控制平面
- 按專案隔離的讀寫
- 可審查的狀態流轉
- 金鑰統一收口
- 降低隨意直寫資料庫的風險

## 各層允許做什麼

### API Server
- 擁有 SQLite / Prisma
- 負責請求校驗
- 負責鑑權和 schema 檢查
- 暴露 Runtime API 路由

### WebUI
- 只透過 `/api/v1/runtime/*` 讀取
- 透過 `/api/v1/events/stream` 接收事件
- 只渲染脫敏摘要
- 不在瀏覽器讀取本機檔案、環境變數或原始 DB 資料

### Worker
- 接收派單 payload
- 執行任務
- 透過 Runtime API 回傳 proof
- 不允許透過直寫 DB 自主完成任務

### Daemon
- 協調輪詢 / 派單 / 審核流程
- 透過批准的 Runtime/API/FSM 邊界推進狀態
- 不能作為 public integration 的隱式 SQLite 客戶端

## 實際安全收益

因為有這條邊界：
- 截圖可以保持可讀且不洩露 secrets
- 審核邏輯可以集中稽核狀態流轉
- 更容易保證專案隔離
- public docs 可以對外解釋一套穩定整合契約

## 對外一句話解釋

如果你只想用一句話說明：

> Nexus Dispatch 天生是 API-only：SQLite 歸 API Server 所有，WebUI、Worker、Daemon 都只能透過 Runtime API 讀寫狀態。

## 相關參考

- [Architecture](../architecture.md)
- [Runtime API](../runtime-api.md)
- [WebUI Guide](./webui-guide.md)
- [Proof Governance Guide](./proof-governance-guide.md)
