# R28-T1 Audit: routes, package scripts, README/assets before rewrite

Task: `nexus-v8-r28-t1-audit-routes-assets-scripts`
Repo: `/opt/projects/nexus-dispatch`
Date: 2026-05-11

## Inputs read

- Plan: `/root/.hermes/projects/nexus-dispatch/r28-readme-trust-consistency-visual-convergence-plan.md`
- User doc: `/root/.hermes/cache/documents/doc_2793012cb365_readme修改建议 v2.md`
- Repo files audited:
  - `src/api/routes.ts`
  - `package.json`
  - `README.md`
  - `README.zh-CN.md`
  - `README.zh-TW.md`
  - `docs/assets/`

## Git baseline

- HEAD: `bbb0ff4 docs(proof): R27-T2 visual contact sheet — old vs approved flow/architecture comparison`
- Pre-existing untracked files observed before this audit proof:
  - `docs/v8/r26-t2-proof-hero-insertion.md`
  - `docs/v8/shun-proof-r22-t1-regenerate-flow-architecture-readable.md`

## Actual mounted API route prefix

`src/api/server.ts` mounts `createApiRouter(...)` under `/api/v1`:

- `app.use('/api/v1', bearerAuth(authToken));`
- `app.use('/api/v1', createApiRouter(authToken, prismaDal));`

Therefore route declarations in `src/api/routes.ts` become public paths prefixed by `/api/v1`.

## Actual Runtime endpoints found in `src/api/routes.ts`

Runtime routes declared in the router:

- `POST /api/v1/runtime/projects`
- `GET /api/v1/runtime/projects/:id`
- `GET /api/v1/runtime/projects/:projectId/settings/visible-language`
- `PATCH /api/v1/runtime/projects/:projectId/settings/visible-language`
- `POST /api/v1/runtime/projects/:projectId/agents`
- `POST /api/v1/runtime/blueprints/freeze`
- `POST /api/v1/runtime/tasks`
- `GET /api/v1/runtime/tasks/pending`
- `POST /api/v1/runtime/tasks/recover-timeouts`
- `GET /api/v1/runtime/tasks/:id`
- `POST /api/v1/runtime/tasks/:id/claim`
- `PATCH /api/v1/runtime/tasks/:id/status`
- `POST /api/v1/runtime/blueprints/thaw-current-phase`
- `POST /api/v1/runtime/blueprints/advance-phase`
- `GET /api/v1/runtime/projects/:projectId/agents`
- `GET /api/v1/runtime/projects/:projectId/review-policies`
- `POST /api/v1/runtime/runs`
- `PATCH /api/v1/runtime/runs/:id/status`
- `POST /api/v1/runtime/artifacts`
- `POST /api/v1/runtime/projects/cronjobs`
- `GET /api/v1/runtime/projects/:projectId/cronjobs`
- `PATCH /api/v1/runtime/projects/:projectId/cronjobs/:cronjobId/status`
- `POST /api/v1/runtime/reports`
- `PATCH /api/v1/runtime/reports/:id/status`
- `POST /api/v1/runtime/tasks/transition`

## Whether `POST /api/v1/runtime/tasks/:taskId/proof` exists

Result: **does not exist in `src/api/routes.ts` as a route declaration.**

Evidence:

- Exact string `tasks/:taskId/proof`: not present in `src/api/routes.ts`.
- Exact string `/runtime/tasks/:taskId/proof`: not present in `src/api/routes.ts`.
- `routes.ts` comments explicitly state legacy proof routes were retired:
  - `V8-R10: legacy direct-DB task claim/release/submit_proof routes retired from production router.`
  - `V8-R10: legacy dynamic review /tasks/:id submit_proof_v2/accept/reject routes retired.`
- Proof-like body fields still exist on `PATCH /runtime/tasks/:id/status` as `proof_data`, but that is not the README-documented `tasks/:taskId/proof` endpoint.

Truthful worker completion chain supported by current Runtime routes:

1. `POST /api/v1/runtime/runs`
2. `POST /api/v1/runtime/artifacts`
3. `POST /api/v1/runtime/tasks/transition`

## Package scripts found

From `package.json`:

```json
{
  "build": "tsc",
  "start": "node dist/index.js",
  "dev": "ts-node src/index.ts",
  "test": "jest",
  "daemon": "ts-node src/daemon/main.ts",
  "db:init:test": "node scripts/init-test-db.js",
  "validate:api-deploy": "node scripts/validate-api-deploy.js"
}
```

Validation scripts actually present:

- `npm run build`
- `npm test`
- `npm run validate:api-deploy`

## Whether mock worker script exists

Result: **no mock worker script found.**

Evidence:

- `package.json` has no script key containing `mock` or `worker`.
- Repository search excluding `.git`, `node_modules`, `dist`, `build`, `.next`, and `coverage` found no file matching a likely mock-worker/demo-worker filename.
- Current README registers a placeholder worker endpoint `http://worker-host:8647/v1/runs`, but does not start a real local worker.

Implication for rewrite:

- Do not keep “5-Minute Happy Path” wording unless a real mock worker is added.
- Rename to `5-Minute Runtime Smoke Test` / `5 分钟 Runtime 冒烟测试` / `5 分鐘 Runtime 冒煙測試` if no mock worker lands.

## Current README image references

### `README.md`

- line 3: `./docs/assets/logo.png`
- lines 15-19: badges use default/mismatched colors: `blue`, `9cf`, `brightgreen`, `purple`, `blue`
- line 23: `./docs/assets/banner.png`
- line 50: `./docs/assets/hero.png`
- line 218: `./docs/assets/nexus-product-flow-approved.jpg`
- line 230: `./docs/assets/nexus-architecture-approved.jpg`

### `README.zh-CN.md`

- line 3: `./docs/assets/logo.png`
- lines 15-19: badges use default/mismatched colors: `blue`, `9cf`, `brightgreen`, `purple`, `blue`
- line 23: `./docs/assets/banner.png`
- line 50: `./docs/assets/hero.png`
- line 218: `./docs/assets/nexus-product-flow-approved.jpg`
- line 230: `./docs/assets/nexus-architecture-approved.jpg`

### `README.zh-TW.md`

- line 3: `./docs/assets/logo.png`
- lines 15-19: badges use default/mismatched colors: `blue`, `9cf`, `brightgreen`, `purple`, `blue`
- line 23: `./docs/assets/banner.png`
- line 50: `./docs/assets/hero.png`
- line 218: `./docs/assets/nexus-product-flow-approved.jpg`
- line 230: `./docs/assets/nexus-architecture-approved.jpg`

## Current README content mismatches to fix downstream

- All three README files still document `POST /api/v1/runtime/tasks/:taskId/proof` at line 178, but that endpoint is not implemented.
- English README heading is `## 5-Minute Happy Path`; CN/TW headings are generic `## 5 分钟快速上手` / `## 5 分鐘快速上手`; Step 5 claims task completion despite no mock worker script.
- Public docs index still exposes internal entries at first level:
  - `docs/TRILINGUAL-STRATEGY.md`
  - `docs/v8/`
- README architecture sections still include large ASCII diagrams inline.
- No `Security Model` / `安全模型` section exists in the current README files.
- Badge palette is not the requested navy/blue system (`315A9E` + `labelColor=0B111E`).
- Formal asset subdirectories requested by plan do not yet exist:
  - `docs/assets/logo/` absent
  - `docs/assets/hero/` absent
  - `docs/assets/flow/` absent
  - `docs/assets/architecture/` absent

## Current `docs/assets/` state

Tracked assets include current public references and many legacy/source/proof assets, including:

- Current README assets:
  - `docs/assets/logo.png`
  - `docs/assets/banner.png`
  - `docs/assets/hero.png`
  - `docs/assets/nexus-product-flow-approved.jpg`
  - `docs/assets/nexus-architecture-approved.jpg`
- Existing generated formal-ish assets in flat directory:
  - `docs/assets/nexus-product-flow-en.png`
  - `docs/assets/nexus-product-flow-zh-CN.png`
  - `docs/assets/nexus-product-flow-zh-TW.png`
  - `docs/assets/nexus-architecture-en.png`
  - `docs/assets/nexus-architecture-zh-CN.png`
  - `docs/assets/nexus-architecture-zh-TW.png`
- Legacy/source naming still tracked:
  - `docs/assets/nexus-logo-user-source.jpg`
  - `docs/assets/nexus-banner-user-source.jpg`
  - `docs/assets/nexus-hero-user-source.jpg`
  - `docs/assets/nexus-hero-background-user-source.jpg`
  - `docs/assets/nexus-product-scheme-user-source.jpg`
  - `docs/assets/nexus-product-screenshot-user-source.jpg`
- Proof/contact sheet assets:
  - `docs/assets/r20-readme-visual-asset-contact-sheet.png`
  - `docs/assets/r21-t3-final-visual-proof-contact-sheet.png`
  - `docs/assets/r21-two-below-hero-comparison-proof.png`
  - `docs/assets/r23-t2-final-proof-contact-sheet.png`
  - `docs/assets/r24-t3-visual-qc-contact-sheet.png`
  - `docs/assets/r27-t2-final-proof-contact-sheet.png`

## Verification commands run

- `npm run build` → PASS (`tsc` exited 0)
- `npm test -- --runInBand --forceExit` → FAIL / timed out after 180s; failures are existing test-suite drift around retired legacy proof routes, `/v1/*` legacy paths, SSE expectations, and task status validation. This audit did not edit production code or README.
- `npm run validate:api-deploy` → FAIL; Prisma validate passed and V8 route-boundary tests passed, but `tests/v8/v8_api_server_deploy_guide.test.ts` failed because current README does not contain expected `Jest` wording.

## Audit conclusion

For the rewrite tasks, the README should be corrected to match the actual Runtime API. In particular:

- Remove `POST /api/v1/runtime/tasks/:taskId/proof` as the main worker proof endpoint.
- Document the truthful Runtime chain: create run → submit artifact → transition task.
- Rename quick start to Runtime Smoke Test unless a real mock worker script is added.
- Use actual package scripts only: `build`, `test`, `validate:api-deploy`.
- Normalize image paths into formal asset directories only after creating/placing those assets.
