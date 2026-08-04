# Learning English Web

[![Vercel](https://img.shields.io/github/deployments/lnwu/learning-english/production?label=vercel&logo=vercel)](https://vercel.com)

## 造句语法练习

使用词汇库中的单词，由 AI（DeepSeek）造句并给出中文，用户用英文作答后再由 AI 批改语法与单词使用，练习结果计入单词熟练度。

### 环境变量

将以下变量配置到 `.env.local`（本地）或部署平台（如 Vercel）的环境变量中，可参考 `.env.example`：

| 变量 | 说明 |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（仅服务端使用，切勿加 `NEXT_PUBLIC_` 前缀） |
| `DEEPSEEK_BASE_URL` | 接口地址，默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 模型名，默认 `deepseek-v4-flash` |

API Key 仅在服务端 Route Handler（`/api/sentence/*`）中使用，不会下发到浏览器。
