# Proof 治理指南

[English](./proof-governance-guide.md)

---

## 目標

本指南解釋 Nexus Dispatch 中公開「Proof Center」模型的工作方式。

產品原則非常簡單：

**公開 WebUI 只展示安全摘要；完整 proof 保存在 Runtime 儲存裡。**

## 為什麼需要這條邊界

操作者需要可見性，但公開介面不能洩露：
- 原始 payload JSON
- 隱藏執行時 ID
- chat ID
- bearer token
- secrets
- 內部 reviewer 證據包

## Proof 治理頁面展示什麼

- artifact type
- 緊湊 run 引用
- 脫敏後的摘要 / 路徑文案
- proof 邊界提醒

## 哪些內容不會出現在公開頁面

- 原始 report payload
- 原始 artifact 內容
- 完整 proof markdown / json
- 隱藏憑據材料
- 內部審核證據包

## 三條規則

### 1. 只展示摘要
WebUI 以掃讀效率優先，不做完整證據 dump。

### 2. Runtime API 邊界
完整 proof 留在 Runtime 儲存和 API-only 邊界之後。
瀏覽器不是資料庫客戶端。

### 3. 有稽核鏈路但不洩露
操作者仍可透過以下資訊追蹤證據鏈：
- artifact type
- audit reference
- 透過受控後端流轉保留的 project/task/run 關係

## 深層 proof 應放在哪裡

本次 launch 相關的內部截圖 proof、review proof 與治理產物應統一放在：

`/root/.hermes/projects/nexus-dispatch/docs/proofs/r40-webui/`

除非後續任務明確升級，否則不進入 public docs repo。

## 推薦操作行為

當有人要求在 public UI 中直接看到 raw proof：
1. 解釋 summary-only 邊界
2. 轉向 Runtime/API 證據層做深度驗證
3. 不要為了方便而擴大公開暴露面

## 相關指南

- [Release Center Guide](./release-center-guide.md)
- [Admin Guide](./admin-guide.md)
- [API-only Safety Boundary](./api-only-safety.md)
