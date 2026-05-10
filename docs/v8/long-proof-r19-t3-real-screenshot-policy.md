# Long Proof — R19-T3 Real Sanitized Screenshot Policy

## 任务
- Task ID: `nexus-v8-r19-t3-real-screenshot-policy`
- Title: `R19-T3: Capture or validate real sanitized screenshot strategy`
- Acceptance mode: `group_only`
- Verification time (UTC): `2026-05-10T16:28:45Z`

## 结论
当前 README 使用的 Usage Screenshot **保留**，不移除：该资产已有 R18-T4 source-chain proof，证明它来自真实本地 WebUI 运行截图，并已完成脱敏；本次 R19-T3 对 README 文案做了轻量修正，去掉 alt 文案中“Telegram + WebUI 组合截图”的暗示，避免把 WebUI-only 真实截图误描述成 Telegram 组合截图。

## Source route / time
- Source route: `http://127.0.0.1:4173`
- Source page: `Engine Settings → Review Policies`
- Runtime class: local live Runtime API + WebUI dev server
- Original capture class: real browser capture from running WebUI, not generated mockup / prototype / DESIGN composition
- Prior source-chain proof: `docs/v8/long-proof-r18-t4-real-screenshot-capture-and-sanitization.md`
- Public verification time (UTC): `2026-05-10T16:28:45Z`

## Final asset
- Final public asset path: `docs/assets/nexus-sanitized-usage-screenshot.png`
- Type: PNG
- Size: `1232×690`
- SHA256: `c3159d752dc48ff71c0b3be2466430d9f7dbec461dec1da56218e3270fd3d45b`
- README references:
  - `README.md`
  - `README.zh-CN.md`
  - `README.zh-TW.md`

## Redaction list
已脱敏 / 不公开：
1. policy ID 列内容（例如策略内部标识）
2. reviewer agent ID 列内容（例如内部 reviewer agent 标识）
3. chat_id / bot_token / Bearer token / API token
4. 个人路径、本地缓存路径、原始浏览器截图路径
5. runtime-sensitive strings / raw identifiers

保留：
1. WebUI 产品 header
2. `Engine Settings` 页面结构
3. `Review Policy Registry` 表格形态
4. GitHub 风格深色 WebUI 产品界面

## README policy decision
- Decision: keep real sanitized WebUI screenshot.
- No-screenshot decision: not needed.
- Reason: current asset has source-chain proof and sanitized pixel proof; only README alt text needed correction to avoid implying Telegram was present in the image.

## 本次修改
- `README.md`: screenshot alt text 改为 “WebUI settings and registry screen from a live local runtime”。
- `README.zh-CN.md`: screenshot alt text 改为“来自本地真实运行时的 WebUI 设置与注册表页面”。
- `README.zh-TW.md`: screenshot alt text 改为“來自本地真實執行時的 WebUI 設定與註冊表頁面”。
- `docs/v8/long-proof-r19-t3-real-screenshot-policy.md`: 本 proof。

## 验证摘要
- Asset metadata: PNG `1232×690`, RGB, SHA256 `c3159d752dc48ff71c0b3be2466430d9f7dbec461dec1da56218e3270fd3d45b`.
- Pixel redaction samples:
  - `redacted_policy_block_approx (460,438) -> (13,17,23)`
  - `redacted_reviewer_block_approx (885,438) -> (13,17,23)`
- README references: all three READMEs point to `./docs/assets/nexus-sanitized-usage-screenshot.png`.
- README screenshot sections: no `sk-`, `ghp_`, `xoxb-`, Bearer credential, chat_id, bot_token, `/root/`, raw policy IDs, or reviewer agent IDs.
- `git diff --check` scoped to README/proof/screenshot files: pass.

## Blockers / limitations
- `vision_analyze` failed due provider credit limit (`402`), so this run relies on repo source-chain proof, asset metadata/hash, README contract checks, and pixel-level redaction samples.
- No new raw screenshot was committed; raw source remains outside public repo per R18-T4 policy.
