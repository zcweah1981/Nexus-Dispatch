# 發布中心指南

[English](./release-center-guide.md)

---

## 目標

發布中心是 Nexus Dispatch 用來查看**可見交付是否準備好**的操作頁面。

它回答的問題很簡單：

**哪些專案輸出已經準備好發給人，哪些還在等待？**

## 頁面追蹤什麼

- 可發布任務組
- 待發送報告
- 已發送報告
- 脫敏後的報告摘要
- 報告發送狀態

## 頁面不追蹤什麼

這裡不是用來查看：
- 原始 proof blob
- 完整 artifact payload
- 隱藏憑據
- 作為公開 UI 正文展示的私有執行時 ID

## 頁面如何閱讀

### 可發布任務組
已完成或已封存，因此具備發布摘要條件的任務組。

### 待發送報告
尚未完全發送的人類可見報告項。
這是對外交付中最重要的阻塞訊號之一。

### 已發送報告
已經透過正常可見回報鏈路交付出去的報告。

### 報告卡片
每張卡片展示：
- 脫敏摘要
- 報告訊息類型
- 緊湊任務引用
- 狀態 pill

## 推薦工作流

1. 先看 pending reports 數量
2. 閱讀最新的脫敏摘要
3. 確認狀態 pill 是否正在走向 sent / completed
4. 如果仍有疑問，轉向 Runtime 證據層，而不是擴大 public UI 暴露面

## 交付原則

發布中心關注的是**可讀交付狀態**。
詳細 proof 仍歸屬於 Runtime 儲存與 reviewer 證據層。

## 常見誤區

- 把「任務完成」當作「對外交付完成」
- 把 public WebUI 卡片當作唯一 proof 來源
- 在截圖或狀態同步裡暴露原始內部 ID

## 相關指南

- [WebUI Guide](./webui-guide.md)
- [Proof Governance Guide](./proof-governance-guide.md)
- [Admin Guide](./admin-guide.md)
