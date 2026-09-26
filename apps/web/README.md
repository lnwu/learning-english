# Learning English Web

[![Vercel](https://img.shields.io/github/deployments/lnwu/learning-english/production?label=vercel&logo=vercel)](https://vercel.com)

Next.js（App Router）+ Firebase（Auth + Firestore）+ MobX + Tailwind CSS 的单词与造句练习应用：

- 词库练习：按中文提示拼写单词，练习结果写入熟练度模型
- 造句练习：DeepSeek 生成语境句并批改，不写入熟练度数据
- Profile：熟练度分布、练习热力图、单词表现、批量归一化与重新生成释义
- 多语言：`zh` / `en`，locale 持久化在 `locale` cookie

## 常用命令

在仓库根目录执行（根脚本经 `bun run --filter '*'` 转发到本 workspace）：

```bash
bun run dev     # 启动开发服务器，首次会自动 vercel link
bun run check   # lint + typecheck + test
bun run test    # bun test
bun run build   # 生产构建
```

## 环境变量

参考 `.env.example` 创建 `.env.local`：

| 变量                                                                                                                                   | 说明                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` / `AUTH_DOMAIN` / `PROJECT_ID` / `STORAGE_BUCKET` / `MESSAGING_SENDER_ID` / `APP_ID` / `MEASUREMENT_ID` | Firebase Web App 配置，缺任一项应用启动即报错                                |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL`                                                                            | 服务端 DeepSeek（BASE_URL / MODEL 可选）；API Key 禁止加 `NEXT_PUBLIC_` 前缀 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN`（或 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`）                                    | 限流与翻译缓存；未配置时本地开发回退进程内实现                               |

## 深入文档

- 代码约定与架构边界：`AGENTS.md`
- 词库同步设计：`docs/architecture/word-sync.md`
- 造句 / DeepSeek 设计：`docs/architecture/sentence-deepseek.md`
- 熟练度算法：`docs/WORD_FAMILIARITY_ALGORITHM.md`
- 部署、环境变量与运行时：`docs/DEPLOYMENT.md`
