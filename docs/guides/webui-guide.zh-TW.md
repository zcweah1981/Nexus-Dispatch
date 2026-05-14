# WebUI 指南

[English](./webui-guide.md)

---

## 目標

本指南說明 Nexus Dispatch 對外 WebUI 的頁面結構，幫助操作者在不接觸原始 Runtime 儲存的前提下快速掃讀專案狀態。

## WebUI 是什麼

- 一個按專案隔離的 Runtime API 可視層
- 一個三語操作介面：English / 简体中文 / 繁體中文
- 預設安全：僅展示可見摘要，不暴露原始 proof blob，不允許瀏覽器直連 SQLite，不允許瀏覽器讀取憑據

## 核心頁面

### 1. 儀表板
- 展示佇列深度、完成數、阻塞/死信訊號、活動任務組、活躍執行數
- 新增三個掃讀優先卡片：
  - **目前流轉焦點**：目前正在推進的任務組
  - **發布脈衝**：還有多少人類可讀報告等待對外交付
  - **Proof 邊界**：提醒深層 artifacts 仍留在 Runtime 儲存

### 2. 生命週期時間線
- 依倒序列出最近的任務組 / 任務活動
- 每條記錄顯示標題、狀態 pill、緊湊引用
- 適合回答「最近發生了什麼」，不是替代完整稽核

### 3. 任務看板
- 五欄結構：
  - 已建立
  - 執行中
  - 等待審核
  - 準備重試 / 阻塞 / 死信 / 已取消
  - 已完成
- 卡片只展示標題、lane、緊湊任務組引用、脫敏 proof 摘要

### 4. 即時事件流
- 展示連線狀態、傳輸方式、fallback 方式、專案隔離 SSE / polling 資訊
- 事件文字在渲染前會先做脫敏
- 用於確認 Runtime 事件流是否正常工作

### 5. 發布中心
- 追蹤可發布任務組、待發送報告、已發送報告
- 關注的是 **人類可見交付狀態**，不是內部 artifact payload
- 頁面內的 operator note 會明確說明：發布狀態看這裡，詳細 proof 仍在 Runtime 邊界之後

### 6. Proof 治理
- 可以視作公開版「Proof Center」
- 只展示：
  - artifact type
  - 緊湊 run 引用
  - 脫敏後的摘要 / 路徑文案
- 強調三個概念：
  - 只展示摘要
  - Runtime 儲存邊界
  - 不洩露敏感資訊的稽核鏈路

### 7. 派單即時流
- 展示緊湊 run/task 引用、分配 Agent、狀態 pill、安全結果摘要
- 適合查看派單與執行占用情況，同時避免大範圍暴露完整 run 標識

### 8. Agent 註冊表
- 展示 agent ID、lane、dialect、status、脫敏後的 endpoint display ref
- 目標是提升註冊表可讀性，而不是展示連線秘密

## 語言切換

右上角語言切換器支援：
- English
- 简体中文
- 繁體中文

三種語言共用同一頁面結構，只切換可見文案。

## 安全邊界

WebUI 永遠不會：
- 直接開啟 SQLite
- 在瀏覽器讀取本機檔案
- 在瀏覽器讀取環境變數或憑據
- 將原始 proof payload 公開渲染為頁面正文

WebUI 只透過 `/api/v1/runtime/*` 與 `/api/v1/events/stream` 和 API Server 通訊。

## 推薦操作路徑

1. 先看 **儀表板** 取得目前脈衝
2. 再看 **任務看板** 理解佇列結構
3. 對外交付前看 **發布中心**
4. 被問到為什麼看不到原始 proof 時看 **Proof 治理**
5. 需要 run 分配視角時看 **派單即時流**

## 截圖說明

本指南對應的三語截圖產物生成在內部 proof 目錄：

`/root/.hermes/projects/nexus-dispatch/docs/proofs/r40-webui/`

除非後續任務明確要求提升為公開素材，否則不進入 public repo。
