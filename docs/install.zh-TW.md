# 安裝與部署指南

<p align="center">
  <a href="./install.md">English</a> · <a href="./install.zh-CN.md">簡體中文</a> · <b>繁體中文</b>
</p>

> R13_API_SERVER_DEPLOY_GUIDE_CONTRACT
>
> 本文是 API Server 的安裝與部署繁體中文導覽版，用於三語導航與繁體中文閱讀入口。
> 如需完整命令細節、全部章節和逐步排障，請同時參考英文主文件 [install.md](./install.md)。
>
> `docs/assets/guide/` 下的圖片資源由三語文件共用；若圖片內仍有英文標籤，以本頁繁體中文標題、說明和上下文為準。

![Guide cover](./assets/guide/nexus-guide-cover.jpg)

## 視覺化導覽

> 共用素材說明：以下部署流程圖、整合圖和驗證截圖在 English / 简体中文 / 繁體中文 三個版本中複用，避免重複維護多套截圖資產。

### 部署流程

![Deployment flow](./assets/guide/deployment-flow.png)

說明：展示從克隆儲存庫、設定環境變數、建構 API/Daemon/WebUI 到完成基礎驗證的整體路徑。

### Hermes 整合

![Hermes integration](./assets/guide/hermes-integration.png)

說明：用於說明 Hermes Agent 如何作為執行端/接入端與 Nexus Dispatch Runtime API 協同。

### OpenClaw Worker 整合

![OpenClaw integration](./assets/guide/openclaw-integration.png)

說明：用於說明 OpenClaw 風格 Worker 的註冊、派單與回傳 proof 閉環。

### 雙系統架構圖

![Dual-system architecture](./assets/guide/dual-system-architecture.png)

說明：強調「單 PM 大腦 + 多異構 Worker 啞執行」和 API-only 邊界。

### API Server 驗證截圖

![API server verification proof](./assets/guide/api-server-verification-proof.png)

說明：該圖用於展示部署驗證形態；公開文件版本應只保留與驗證結果相關的資訊，不暴露聊天對象、token、chat_id 或其他敏感欄位。

---

## 閱讀路徑建議

### 我是首次部署使用者
1. 先閱讀英文完整版 [install.md](./install.md) 的 **Docker Compose Deployment**。
2. 再查看 **Bare-Metal Deployment with systemd** 與 **Troubleshooting**。
3. 最後執行文末 **Verification Commands** 做收尾檢查。

### 我只想確認架構和接入方式
- 看本頁的部署流程圖、Hermes/OpenClaw 整合圖、雙系統架構圖。
- 回到專案主頁 [README.zh-TW.md](../README.zh-TW.md) 查看產品定位與核心能力。

### 我需要完整命令與參數
- 英文主文件： [install.md](./install.md)
- 產品概覽： [README.zh-TW.md](../README.zh-TW.md)
- 英文 README： [README.md](../README.md)

---

## 語言與素材策略

- 三語文件統一複用 `docs/assets/guide/` 下的公共素材。
- 若圖片內有英文介面/命令文字，優先透過在地化標題、說明與前後文消除閱讀障礙。
- 後續如新增強文字型截圖，優先補充無文字版、裁剪版或可三語共用的註解版，避免英文圖直接破壞中文閱讀流。

## 驗證入口

如需執行正式部署驗證，請使用英文主文件末尾的命令集合：
- [Verification Commands](./install.md#12-verification-commands)
- [Troubleshooting](./install.md#11-troubleshooting)
- [Docker Compose Deployment](./install.md#3-docker-compose-deployment)
- [Bare-Metal Deployment with systemd](./install.md#7-bare-metal-deployment-with-systemd)
