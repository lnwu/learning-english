# Learning English

本文件包含 AI 在本项目中工作时必须遵守的全局规则与项目入口。

## 适用范围与优先级

- 本文件适用于仓库全部文件；本文路径均相对仓库根目录。
- 修改 `apps/web/**` 时，同时遵循 `apps/web/AGENTS.md`；修改 `infra/**` 时，同时遵循 `infra/AGENTS.md`。就近规则优先于本文件。
- 深入设计文档：架构动机见 `docs/architecture/`，熟练度算法见 `docs/WORD_FAMILIARITY_ALGORITHM.md`，开发与部署见 `docs/DEPLOYMENT.md`。
- 仅当公共接口、数据格式、架构约束、部署流程或项目不变量变化时，更新相关文档与就近 `AGENTS.md`；纯实现细节调整无需机械更新文档。

## 通用规则

- 回复用户和编写文档时使用中文。
- 生成代码时不要新增注释。
- 修改前检查工作区状态，不覆盖或提交用户已有的无关改动；功能实现和基础设施任务使用独立分支，纯文档任务按交付规则直接推送到 `main`。

## 工具链

- 项目统一使用 Bun；安装依赖和执行工具分别使用 `bun install`、`bun x <命令>`，不要使用 npm/npx。
- 在仓库根目录使用统一入口：`bun run lint`、`bun run typecheck`、`bun run test`、`bun run build`；`bun run check` 一次执行 lint、typecheck 和 test。CI 与本地验证使用相同入口，不直接调用 `tsc` 或 `eslint`。
- `apps/web` 使用 `bun test`（`bun:test`），测试文件与源码同目录并命名为 `*.test.ts`。

## 交付与验收

- 用户明确要求的功能实现任务完成后，按以下顺序交付：`apps/web` 在仓库根目录运行 `bun run check`（影响构建时再运行 `bun run build`）→ 只提交本任务改动并推送独立分支 → 创建或更新 PR。
- `apps/web` 功能 PR 必须等待 Web `checks`、`build` 与 Vercel Preview 部署完成；从 `gh pr checks` 或 Vercel 评论读取实际 Preview URL，不推测 URL。
- Preview 就绪后，必须用 `agent-browser` 打开 Preview 验证本次功能改动：固定使用持久化 profile `~/.agent-browser/profiles/vercel-preview`（session 名 `vercel-preview`），即 `agent-browser --profile ~/.agent-browser/profiles/vercel-preview open <preview-url>`。profile 内保存 Vercel 授权，取代旧的 `state load`/`state save`，无需再管理 `.preview-state.json`；访问新预览域名时若因未授权退回 Vercel 登录页，由用户在 `--headed` 浏览器中完成一次授权，后续复用该 profile。**会话失效或未建立时，暂停验收并要求用户手动重新登录**，不得引入 OIDC token、不得启用 Protection Bypass secret。初次建立：`agent-browser --profile ~/.agent-browser/profiles/vercel-preview open <preview-url> --headed`，由用户在弹出的浏览器中亲自完成 Vercel 授权。凭证明文只存在该 profile 目录（权限 0700），不打印、不提交、不写进文档。验证应检查实际行为和关键页面状态，不只确认页面能打开；Preview 应用自身匿名登录、数据在 `users/preview`，无需预置本站登录态。
- 只有自动化检查和 Preview 浏览器验证均通过后，才使用 `gh pr merge` 合并 PR；验证失败时不得合并，先修复、重新推送并重新完成部署与验证。Preview 会话失效、用户未完成登录时暂停验收，不得把未验证视为通过，不擅自启用 Protection Bypass secret。
- `infra` 变更按 `infra/AGENTS.md` 检查 Terraform plan 评论。
- 纯文档变更（仅修改 Markdown 文档、`AGENTS.md` 或文档型 skill，且不涉及代码、配置、依赖或部署行为）不需要本地测试、构建、Preview 或浏览器验收；完成后直接提交并推送到 `main`，不创建 PR。
- 除上述功能验收外，默认不启动 dev server、不做浏览器截图或人工点击验收。不要修改外部管理的 `.agents/skills/agent-browser`；Preview 会话凭证只在内存与 `~/.agent-browser/profiles/vercel-preview` 中传递，不打印、不写进文档，不执行未经确认的写操作。
- shell 每次调用是新进程，环境变量不跨调用持久；`AGENT_BROWSER_SESSION` 必须在每条 `agent-browser` 命令内联设置（`export AGENT_BROWSER_SESSION="$(agent-browser session id --scope worktree --prefix vercel-preview)"` 后紧跟实际操作），否则丢失命名会话、回退到默认端点并可能误连其他浏览器实例。

## 关键环境不变量

- Vercel preview 共用匿名用户数据 `users/preview`；`scripts/sync-preview-words.mjs` 每 6 小时将生产用户的 `words` 与 `practiceTime` 镜像覆盖到该路径。preview 数据允许被覆盖，这是有意设计，不要增加用户隔离或删除同步任务；实现与安全规则见 `docs/DEPLOYMENT.md` 和 `infra/AGENTS.md`。
