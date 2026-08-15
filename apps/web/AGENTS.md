# Learning English Web

本文件包含 AI 在本项目中工作时必须遵守的规则和项目信息。

## 词库状态管理

- `src/hooks/useFirestoreWords.tsx`：`Words` 是模块级 MobX 单例 store；`WordsProvider`（挂在根 layout）在登录后全局只做一次 `onSnapshot` 订阅，`useFirestoreWords` 只是读 Context，不要在页面里再订阅 Firestore。
- 熟练度结果通过 `#masteryCache` 缓存（随 `recordCorrect/IncorrectAttempt`、`setWords` 失效），全量统计用 computed getter（`overallAverageInputTime`、`averageTimeByLengthCategory`、`practiceStats`），新增派生数据时优先用 computed getter 而非每次渲染重算。
- 练习页的输入值在 `words.userInputs` 中，单词行是独立的 observer 组件（`WordRow`），只有对应行会随击键重渲染，不要在父组件渲染路径里读 `userInputs`。

## 造句练习与 DeepSeek 集成

- 造句/批改功能通过服务端 Route Handler（`src/app/api/sentence/*`）代理调用 DeepSeek，浏览器只请求本站 `/api/*`。
- `/api/*` 要求请求头携带 Firebase ID token（`Authorization: Bearer <token>`），由 `src/lib/serverAuth.ts` 通过 Identity Toolkit REST API 校验；校验通过返回 `{ uid }`，失败返回 401 的 NextResponse（用 `instanceof NextResponse` 区分）。
- `/api/*` 按 uid 做进程内固定窗口限流（`src/lib/rateLimit.ts`），超限返回 429；新增 API 路由时应加上限流与输入长度上限。
- DeepSeek 封装位于 `src/lib/deepseek.ts`，读取环境变量 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`。
- API Key 只允许在服务端使用，禁止加 `NEXT_PUBLIC_` 前缀或下发到前端。
- 造句练习复用 `useFirestoreWords` 的单词库与 `recordCorrectAttempt`/`recordIncorrectAttempt`，练习结果计入单词熟练度并同步到 Firebase。
- 造句题目界面不直接显示目标单词（答题后的反馈区才显示），这是有意设计：学生凭中文句子推断用词，因此造句请求会把词库中存的中文译法随目标词一并传给模型，prompt 要求中文译文自然地道、使用参考译法且能让学生反推出目标词；批改时对目标词的同义表达不判错、仅提示。
- 批改接口在调用模型前先对答案与参考译文做规范化判等，完全一致直接返回满分，不消耗模型调用。
