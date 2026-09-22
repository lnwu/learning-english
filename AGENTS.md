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
- 设计文档在 `docs/`（架构动机 `docs/architecture/`、算法 `WORD_FAMILIARITY_ALGORITHM.md`、部署 `DEPLOYMENT.md`），改行为时与 AGENTS.md 成对更新。

## 工具链

- 本项目使用 bun（turbo monorepo，根目录有 `bun.lock`）。本机环境没有 node/npm/npx，运行脚本、安装依赖、执行测试一律用 `bun` / `bun x <命令>`。
- 根目录统一入口：`bun run lint` / `bun run typecheck` / `bun run test` / `bun run build`（均走 turbo），`bun run check` 一次执行 lint + typecheck + test；CI 使用同一组入口，不要在 workflow 里直接调 `tsc`/`eslint`。
- 单元测试：`apps/web` 使用 bun test（`bun:test`），测试文件与源码同目录（`*.test.ts`）。

## 交付流程：直接提 PR + Preview 验收

- 完成任务后不要停在本地验证：直接提交、推送分支、用 `gh pr create` 开 PR，然后把 Vercel Preview 链接发给用户，由用户自己在预览环境验收。
- 不要为了验证去起 dev server、跑浏览器截图或做人工点击核对；把能自动化的检查跑完即可：`apps/web` 下 `bun run lint`、`bun x tsc`、`bun run test`，必要时 `bun run build`。
- 取 Preview 链接：`gh pr checks <PR号>` 里 Vercel 那一行的部署详情，或 PR 上 Vercel 机器人评论表格里的 Preview 链接，形如 `https://learning-english-web-git-<分支名>-wu-linings-projects.vercel.app`（分支别名固定，后续推送会更新同一链接）。
- 交付前确认 PR 上 CI（`checks` 与 `build` 两个 job）与 `Vercel` 检查都是 pass；失败要修到通过再把链接给用户。

## 预览环境与 sync-preview-words

- Vercel preview 环境使用匿名登录，`getEffectiveUserId` 会把所有用户映射到 `preview` 用户，读写 `users/preview/*`。
- `scripts/sync-preview-words.mjs` 定时把生产用户的数据复制到 `users/preview`（镜像覆盖 `words` 与 `practiceTime` 两个子集合：diff 增量写入、preview 多出的文档删除，每 6 小时一次），这是**有意设计**，为了让 preview 环境始终有可练习的真实数据，不要把它当作冗余任务优化掉；preview 访客产生的练习时间会在每次同步时被生产数据覆盖。
- `users/preview` 的 Firestore 规则：读对任何已登录用户开放，写仅限匿名用户（`sign_in_provider == 'anonymous'`），防止正式环境的 Google 用户越权篡改 preview 数据。
