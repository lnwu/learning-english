# Learning English Web

本文件包含 AI 在本项目中工作时必须遵守的规则和项目信息。

## 造句练习与 DeepSeek 集成

- 造句/批改功能通过服务端 Route Handler（`src/app/api/sentence/*`）代理调用 DeepSeek，浏览器只请求本站 `/api/*`。
- `/api/sentence/*` 要求请求头携带 Firebase ID token（`Authorization: Bearer <token>`），由 `src/lib/serverAuth.ts` 通过 Identity Toolkit REST API 校验，未通过返回 401。
- DeepSeek 封装位于 `src/lib/deepseek.ts`，读取环境变量 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`。
- API Key 只允许在服务端使用，禁止加 `NEXT_PUBLIC_` 前缀或下发到前端。
- 造句练习复用 `useFirestoreWords` 的单词库与 `recordCorrectAttempt`/`recordIncorrectAttempt`，练习结果计入单词熟练度并同步到 Firebase。
- 造句题目界面不直接显示目标单词（答题后的反馈区才显示），这是有意设计：学生凭中文句子推断用词，因此造句请求会把词库中存的中文译法随目标词一并传给模型，prompt 要求中文译文自然地道、使用参考译法且能让学生反推出目标词；批改时对目标词的同义表达不判错、仅提示。
