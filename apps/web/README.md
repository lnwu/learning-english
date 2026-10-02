# Learning English Web

[![Vercel](https://img.shields.io/github/deployments/lnwu/learning-english/production?label=vercel&logo=vercel)](https://vercel.com)

Next.js（App Router）+ Firebase（Auth + Firestore）+ MobX + Tailwind CSS 的单词与造句练习应用：

- 词库练习：按中文提示拼写单词，练习结果写入熟练度模型
- 造句练习：AI 生成语境句并批改，不写入熟练度数据
- AI 模型：DeepSeek、OpenCode Zen（Claude / Gemini）与 MiMo 可选，添加单词时支持多模型对比释义
- Profile：熟练度分布、练习热力图、单词表现、批量归一化与重新生成释义
- 多语言：`zh` / `en`，locale 持久化在 `locale` cookie

## 常用命令

在仓库根目录执行（根脚本经 `bun run --filter '*'` 转发到本 workspace）：

```bash
bun run dev     # 启动开发服务器，首次会自动 vercel link
bun run check   # lint + format:check + typecheck + test
bun run test    # bun test
bun run build   # 生产构建
```

## 环境变量

参考 `.env.example` 创建 `.env.local`：

| 变量                                                                                                                                   | 说明                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` / `AUTH_DOMAIN` / `PROJECT_ID` / `STORAGE_BUCKET` / `MESSAGING_SENDER_ID` / `APP_ID` / `MEASUREMENT_ID` | Firebase Web App 配置，缺任一项应用启动即报错                                                                 |
| `DEEPSEEK_API_KEY` / `OPENCODE_API_KEY` / `MIMO_API_KEY`                                                                               | 服务端 AI 服务的 API Key（baseUrl 与模型清单在 `src/lib/aiProviders.ts`）；API Key 禁止加 `NEXT_PUBLIC_` 前缀 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN`（或 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`）                                    | 限流与翻译缓存；未配置时本地开发回退进程内实现                                                                |

## 深入文档

- 代码约定与架构边界：`AGENTS.md`
- 词库同步设计：`docs/architecture/word-sync.md`
- 造句 / AI 集成设计：`docs/architecture/sentence-ai.md`
- 熟练度算法：`docs/WORD_FAMILIARITY_ALGORITHM.md`
- 部署、环境变量与运行时：`docs/DEPLOYMENT.md`
