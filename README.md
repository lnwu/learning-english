# Learning English

[![Infrastructure](https://github.com/lnwu/learning-english/actions/workflows/infra-deploy.yml/badge.svg)](https://github.com/lnwu/learning-english/actions/workflows/infra-deploy.yml)
[![Vercel](https://img.shields.io/github/deployments/lnwu/learning-english/production?label=vercel&logo=vercel)](https://vercel.com)

英语单词与造句练习应用。monorepo 结构：

- `apps/web`：Next.js（App Router）+ Firebase（Auth + Firestore）+ MobX + Tailwind CSS
- `infra`：Terraform 管理 GCP 项目、Identity Platform、Firestore 与安全规则
- `scripts`：`sync-preview-words.mjs`，定时把生产词库同步到 preview 用户

## 本地开发

前置要求：bun（本项目没有 node/npm，所有命令一律用 `bun` / `bun x`）。

1. 安装依赖：`bun install`
2. 在 `apps/web` 下创建 `.env.local`，参照 `apps/web/.env.example` 填写：
   - Firebase 配置项全部必须带 `NEXT_PUBLIC_` 前缀，缺任何一个应用启动会直接报错
   - `DEEPSEEK_API_KEY` 等仅服务端使用，禁止加 `NEXT_PUBLIC_` 前缀
3. 启动开发服务器：`bun run dev`（会先执行 `vercel link` 关联 Vercel 项目）

常用命令（在 `apps/web` 下执行）：

- `bun run test`：运行 vitest 单元测试
- `bun x tsc --noEmit`：类型检查
- `bun run lint`：ESLint

## 预览环境

Vercel preview 环境使用匿名登录，所有用户共享 `users/preview` 词库数据；`scripts/sync-preview-words.mjs` 每 6 小时把生产词库 diff 增量同步过去，保证 preview 始终有可练习的真实数据。

## 生产环境注意

- API 限流与翻译缓存在未配置 Upstash Redis 时回退到单实例内存实现，多实例下不生效。生产环境请通过 Vercel Marketplace 安装 Upstash for Redis（自动注入 `KV_REST_API_*` 环境变量）。

