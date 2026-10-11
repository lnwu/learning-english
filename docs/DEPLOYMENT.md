# 部署与运维

## 部署链路

- **前端** `apps/web`：Vercel Git 集成，push main 自动部署，PR 自动建 preview 环境。
- **基础设施** `infra/`：push main 自动 `terraform apply`（无审批，PR 阶段由 `infra-plan.yml` 跑 plan 评论）。详见 `infra/AGENTS.md`。
- **preview 数据**：`sync-preview-words.yml` 每 6 小时把 `PROD_USER_UID` 的 `words`/`practiceTime` 镜像覆盖到 `users/preview`（diff 增量写、preview 多出的删除），因此 preview 数据可丢、规则可以偏宽松。
- PR 功能验收流程、Preview 浏览器验证与合并门禁见根 `AGENTS.md`「交付与验收」。

## Vercel 运行时

- `apps/web/vercel.json` 的 `bunVersion` 固定 `1.4.x`：Vercel Functions（API 路由与 SSR）在 Bun 上运行，Next 的 build/dev 也经 `bun run --bun` 执行；版本与本机 `packageManager`、CI 的 bun 1.4.2 对齐。
- `regions` 固定 `hkg1`：函数就近访问 Upstash（`sin1`）、Firestore / Identity Platform（`asia-east2`）与各模型服务商 API。

## 日志与可观测性

- 日志是**单行 JSON**，经 `console.*` 打到 stdout，Vercel Runtime Logs 按 console 方法判定级别、按字段过滤。字段由 `apps/web/src/lib/log.ts` 统一组装：`level`/`time`/`message`/`event` + `env`/`region`/`commit` + 业务字段；事件名是 `LOG_EVENTS` 的闭集（新增事件改这个数组），新增字段一律 camelCase。
- 服务端：`handleApiPost` 每个请求记一条 `api.request`（`route`/`policy`/`uid`/`status`/`durationMs`），并把 `requestId` 写进 `x-request-id` 响应头与错误响应体；未捕获的 SSR/路由异常由 `src/instrumentation.ts` 的 `onRequestError` 记为 `server.error`。
- 外部调用必须能看出耗时与失败原因：模型调用每次尝试记 `ai.call`（`provider`/`model`/`attempt`/`durationMs`/`timeoutMs`/`outcome`/`willRetry`/token 用量/上游 `statusCode`），调用结束记 `ai.call.summary`（`totalMs`/`attempts`/`outcome`）；来源检索记 `source.search`，ID token 校验记 `auth.token.verify`，翻译缓存记 `cache.lookup`。`AiServiceError` 会带上上游 `statusCode`/`responseBody`/`url` 供日志输出，但对外的错误文案与状态码语义不变。
- 客户端：`warn`/`error` 由 `lib/log.ts` 批量 POST 到 `/api/log`（`handleApiPost` + `logs` 限额 30/min，只收白名单事件，失败静默），服务端补 `uid` 与 `origin: "client"` 后打回同一条流；匿名登录失败发生在拿到 uid 之前，这类错误只留在浏览器控制台。
- 日志里不允许出现单词原文、用户句子、prompt 与任何凭据：`lib/log.ts` 按禁止键脱敏并截断超长值，调用方不要再自行拼接这些内容。
- 查询入口：`bun run logs`（包装 `vercel logs --json`，解析并摊平我们的 JSON 事件）。常用形式：

```bash
bun run logs --since 30m --level error           # 近半小时的错误
bun run logs --environment preview --since 10m   # PR preview 环境
bun run logs --event ai.call,ai.call.summary     # 只看某个事件（逗号分隔）
bun run logs --request-id <id> --json            # 单个请求的全部记录
```

- 命中 `error` 级事件时脚本退出码非 0；`--requests` 额外打印状态码 >= 400 的请求行，`--json` 输出原始 JSONL 供 `jq` 处理。`--level` 与 `--query` 透传给 `vercel logs`（只认 Vercel 自己的字段）；`--event` 与 `--request-id` 在本地按我们的字段过滤。
- **保留期**：Runtime Logs 在 Hobby **只保留 1 小时**（Log Drains 与 Observability Plus 都要 Pro），所以脚本窗口超过 1 小时时会明确提示，而不是静默返回空。报错后尽快查；超过 1 小时只能靠复现。
- 排查一条用户报错的顺序：`bun run logs --since 15m --level error` 找事件 → 复制 `requestId` → `bun run logs --since 30m --request-id <id> --json` 看完整字段（含 `errorCause`/`errorResponse`/`outcome`）→ 若是 `ai.call`，再看 `provider`/`model`/`statusCode`/`totalMs` 判断是限流、超时还是模型返回异常。

## Vercel 环境变量（apps/web 项目）

| 变量 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` / `AUTH_DOMAIN` / `PROJECT_ID` / `STORAGE_BUCKET` / `MESSAGING_SENDER_ID` / `APP_ID` / `MEASUREMENT_ID` | Firebase Web App 配置（Firebase 控制台获取），缺失时构建/运行直接抛错 |
| `NEXT_PUBLIC_VERCEL_ENV` | Vercel 自动注入（preview 判定用） |
| `DEEPSEEK_API_KEY` / `OPENCODE_API_KEY` / `MIMO_API_KEY` | 服务端 AI 服务的 API Key（baseUrl 与模型清单写在 `apps/web/src/lib/aiProviders.ts`）；缺哪个就禁用对应服务商的模型 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` 或 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Vercel Marketplace 装 Upstash Redis 后自动注入，用于全局限流与翻译缓存 L2；未配置时回退进程内（仅本地开发可接受） |

- **API Key 禁止加 `NEXT_PUBLIC_` 前缀下发前端。**

## GitHub Secrets

`TF_API_TOKEN`、`GCP_WORKLOAD_IDENTITY_PROVIDER`、`GCP_SERVICE_ACCOUNT_EMAIL`、`GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET`、`PROD_USER_UID`。清单与用途见 `infra/AGENTS.md`「项目与资源清单」。

## 本地开发

```bash
bun install               # 根目录
bun run dev               # 自动 vercel link（缺失时）+ 启动 Next dev
bun run check             # lint + format:check + typecheck + test
bun run build             # 构建
bun run sync:preview      # 手动同步 preview 数据（需 ADC + PROD_USER_UID）
```

- 根脚本通过 `bun run --filter '*' <script>` 转发到各 workspace。
- `apps/web/.env.local` 提供 Firebase 变量（不入库）；AI 服务的 API Key 可选，无 key 时对应服务商的模型不可选，仅剩的服务商也无 key 时翻译/造句接口返回 500。
- 本机没有 terraform/firebase CLI，infra 变更只能靠 CI 的 plan/apply 验证。

## 熟练度校准（导出与拟合）

1. `export-review-logs` 每周一自动运行（也可手动触发）：产物 artifact `calibration-export` 内含官方格式的 `revlog.csv`（`card_id,review_time,review_rating`）、原始 `reviews.json` 与校准报告 `report.json`；workflow 日志同时打印可靠性表、Brier 与 AUC。
2. 可校准样本达到门槛（`lib/calibrationMetrics.ts` 的 `CALIBRATION_MIN_SAMPLES = 500`）时，工作流自动创建 `calibration` 标签的 Issue（标题「熟练度校准样本已达标」，正文含指标与拟合步骤；已有未关闭的同类 Issue 则跳过）；未达标时只留 artifact，不打扰。
3. 按 Issue 指引本地拟合（需 Python）：`python -m pip install fsrs-optimizer`，再执行 `python -m fsrs_optimizer revlog.csv -y -o weights.json`；结果（优化后的 `w`、`evaluation.json` 指标）与报告一起评估。
4. 只有指标有改善时才发布：把新权重写入 `apps/web/src/lib/masteryModel.ts` 的 `W`、提升 `MODEL_VERSION`，走功能分支 + Preview 验收后合并，并关闭对应的校准 Issue。
5. 本地导出（需 ADC 与 `PROD_USER_UID`）：`bun run calibrate:export --out calibration-out`；查看报告 `bun run calibrate:report calibration-out/reviews.json`；预览通知正文 `bun run calibrate:issue calibration-out/report.json --dry-run`。

## 事故处理

- **生产词库没有 PITR，删除不可恢复**：删 `users/{uid}` 子集合前先导出；Firestore 库级删除有保护（`DELETE_PROTECTION_ENABLED` + `prevent_destroy`）。
- **客户端写入被拒**（表现为 toast `sync.dataLost` 或写操作报 permission-denied）：先确认登录态与路径（`users/{uid}/**` 本人读写、`users/preview/*` 仅匿名用户写），再排查是否误改了 `firestore.rules` 的 match 条件。
- **⚠️ rules 发布不是原子的**：`google_firebaserules_ruleset` 的更新流程是**先销毁旧 ruleset 再创建新的**，新规则一旦被 Ruleset API 拒绝（如语法/语义不支持），会留下「无生效规则」的空窗，**所有客户端读写被拒**（2026-09-22 曾因此宕机约 4 分钟）。改 `firestore.rules` 前必须先编译验证：本地装 Java 后用 `bun x firebase-tools emulators:exec --only firestore`（配置指向规则文件）确认加载无错，再推送；apply 失败时立即把旧规则内容回滚重推恢复，不要先在本地慢慢排查。
- 定时任务（sync-preview-words）失败只给最后改过 workflow 的人发 GitHub 邮件，失败要去 Actions 页看日志。
- **线上日志只保留 1 小时**：排查报错先跑 `bun run logs --since 30m --level error`，用法与事件名清单见上文「日志与可观测性」。
