# 部署与运维

## 部署链路

- **前端** `apps/web`：Vercel Git 集成，push main 自动部署，PR 自动建 preview 环境。
- **基础设施** `infra/`：push main 自动 `terraform apply`（无审批，PR 阶段由 `infra-plan.yml` 跑 plan 评论）。详见 `infra/AGENTS.md`。
- **preview 数据**：`sync-preview-words.yml` 每 6 小时把 `PROD_USER_UID` 的 `words`/`practiceTime` 镜像覆盖到 `users/preview`（diff 增量写、preview 多出的删除），因此 preview 数据可丢、规则可以偏宽松。

## Vercel 环境变量（apps/web 项目）

| 变量 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` / `AUTH_DOMAIN` / `PROJECT_ID` / `STORAGE_BUCKET` / `MESSAGING_SENDER_ID` / `APP_ID` / `MEASUREMENT_ID` | Firebase Web App 配置（Firebase 控制台获取），缺失时构建/运行直接抛错 |
| `NEXT_PUBLIC_VERCEL_ENV` | Vercel 自动注入（preview 判定用） |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` | 服务端 DeepSeek（BASE_URL/MODEL 可选，缺省走内置） |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` 或 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Vercel Marketplace 装 Upstash Redis 后自动注入，用于全局限流与翻译缓存 L2；未配置时回退进程内（仅本地开发可接受） |

- 只有 `NEXT_PUBLIC_*` 参与 turbo 构建缓存 hash（`turbo.json`），运行时变量（DeepSeek/Upstash）改了不需要清构建缓存。
- **API Key 禁止加 `NEXT_PUBLIC_` 前缀下发前端。**

## GitHub Secrets

`TF_API_TOKEN`、`GCP_WORKLOAD_IDENTITY_PROVIDER`、`GCP_SERVICE_ACCOUNT_EMAIL`、`GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET`、`PROD_USER_UID`。清单与用途见 `infra/AGENTS.md`「项目与资源清单」。

## 本地开发

```bash
bun install               # 根目录
bun run dev               # 自动 vercel link（缺失时）+ turbo dev
bun run check             # lint + typecheck + test（turbo）
bun run build             # 构建
bun run sync:preview      # 手动同步 preview 数据（需 ADC + PROD_USER_UID）
```

- `apps/web/.env.local` 提供 Firebase 变量（不入库）；`DEEPSEEK_API_KEY` 可选，无 key 时翻译/造句接口返回 500。
- 本机没有 terraform/firebase CLI，infra 变更只能靠 CI 的 plan/apply 验证。

## 事故处理

- **生产词库没有 PITR，删除不可恢复**：删 `users/{uid}` 子集合前先导出；Firestore 库级删除有保护（`DELETE_PROTECTION_ENABLED` + `prevent_destroy`）。
- **客户端写入被拒**（表现为 toast `sync.dataLost` 或写操作报 permission-denied）：先核对 `infra/modules/firebase/firestore.rules` 的字段校验与 `apps/web` 写入字段是否成对改过——加字段不同步 rules 是最可能的原因。
- **rules 变更无法本地验证**（无 firebase CLI/Java）：合并后 `infra-deploy` 若 apply 失败，rules 保持旧版不会影响线上；修好再推。
- 定时任务（sync-preview-words）失败只给最后改过 workflow 的人发 GitHub 邮件，失败要去 Actions 页看日志。
