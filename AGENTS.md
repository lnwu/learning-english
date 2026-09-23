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
- 修改前检查工作区状态，不覆盖或提交用户已有的无关改动；实现任务使用独立分支，不直接向 `main` 推送。

## 工具链

- 项目统一使用 Bun；安装依赖和执行工具分别使用 `bun install`、`bun x <命令>`，不要使用 npm/npx。
- 在仓库根目录使用统一入口：`bun run lint`、`bun run typecheck`、`bun run test`、`bun run build`；`bun run check` 一次执行 lint、typecheck 和 test。CI 与本地验证使用相同入口，不直接调用 `tsc` 或 `eslint`。
- `apps/web` 使用 `bun test`（`bun:test`），测试文件与源码同目录并命名为 `*.test.ts`。

## 交付与验收

- 用户明确要求的实现任务完成后，运行相关本地检查，只提交本任务改动，推送分支并创建或更新 PR；分析、评审和仅制定方案的任务不自动提交或推送。
- `apps/web` 变更在仓库根目录运行 `bun run check`，影响构建时再运行 `bun run build`。交付前确认 PR 的 Web `checks`、`build` 与 Vercel 检查均通过，并从 `gh pr checks` 或 Vercel 评论中提供实际 Preview 链接，不推测 URL。
- `infra` 变更按 `infra/AGENTS.md` 检查 Terraform plan 评论；文档或 `AGENTS.md` 单独变更无需等待 Vercel Preview。
- 默认不启动 dev server、不做浏览器截图或人工点击验收；只有用户明确要求浏览器操作时才使用 `agent-browser`。不要修改外部管理的 `.agents/skills/agent-browser`，项目特有连接方式见 `.agents/skills/user-chrome/SKILL.md`。连接真实登录态时，不执行未经确认的写操作。

## 关键环境不变量

- Vercel preview 共用匿名用户数据 `users/preview`；`scripts/sync-preview-words.mjs` 每 6 小时将生产用户的 `words` 与 `practiceTime` 镜像覆盖到该路径。preview 数据允许被覆盖，这是有意设计，不要增加用户隔离或删除同步任务；实现与安全规则见 `docs/DEPLOYMENT.md` 和 `infra/AGENTS.md`。
