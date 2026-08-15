# Learning English

本文件包含 AI 在本项目中工作时必须遵守的规则和项目信息。

## 通用规则

- 回复我时使用中文。
- 写文档时使用中文。
- 生成代码时不用生成注释。
- 每次更新代码后检查 AGENTS.md 是否需要更新。

## 范围优先级

- 在 `apps/web` 改代码时，遵循 `apps/web/AGENTS.md` 与本文件。
- 在 `infra` 改代码时，遵循 `infra/AGENTS.md` 与本文件。
- 就近规则优先（子目录 `AGENTS.md` 优先于根目录）。

## 工具链

- 本项目使用 bun（turbo monorepo，根目录有 `bun.lock`）。本机环境没有 node/npm/npx，运行脚本、安装依赖、执行测试一律用 `bun` / `bun x <命令>`。
- 单元测试：`apps/web` 使用 vitest，在 `apps/web` 下运行 `bun run test`（即 `vitest run`），测试文件与源码同目录（`*.test.ts`）。

## 预览环境与 sync-preview-words

- Vercel preview 环境使用匿名登录，`getEffectiveUserId` 会把所有用户映射到 `preview` 用户，读写 `users/preview/*`。
- `scripts/sync-preview-words.mjs` 定时把生产用户词库复制到 `users/preview`（diff 增量同步，每 6 小时一次），这是**有意设计**，为了让 preview 环境始终有可练习的真实数据，不要把它当作冗余任务优化掉。
- `users/preview` 的 Firestore 规则：读对任何已登录用户开放，写仅限匿名用户（`sign_in_provider == 'anonymous'`），防止正式环境的 Google 用户越权篡改 preview 数据。
