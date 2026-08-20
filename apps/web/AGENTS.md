# Learning English Web

本文件包含 AI 在本项目中工作时必须遵守的规则和项目信息。

## 词库状态管理

- `src/lib/wordsStore.ts`：`Words` MobX store 类与 `mergeSnapshotIntoStore`/`parseWordDoc`/`isWordDataEqual` 等纯逻辑，不依赖 Firebase 运行时，配套测试 `wordsStore.test.ts`；`src/hooks/useFirestoreWords.tsx` 持有模块级单例并负责 Firestore 订阅与同步。`WordsProvider`（挂在根 layout）在登录后全局只做一次 `onSnapshot` 订阅，`useFirestoreWords` 只是读 Context，不要在页面里再订阅 Firestore。
- 熟练度结果通过 `#masteryCache` 缓存（随 `recordCorrect/IncorrectAttempt`、`setWordData`/`deleteWord`/`removeAllWords` 失效），全量统计用 computed getter（`overallAverageInputTime`、`averageTimeByLengthCategory`、`practiceStats`），新增派生数据时优先用 computed getter 而非每次渲染重算。
- Firestore `onSnapshot` 结果通过 `mergeSnapshotIntoStore(store, snapshot)` 增量合并到 store（仅更新变化的单词、按需使缓存失效），不要改成全量替换 `wordData`，否则会导致所有 observer 组件无谓重渲染。
- `correctPracticeDates` 存 `YYYY-MM-DD` 本地日期字符串（`formatLocalPracticeDate`），不要存 ISO 时间戳，避免时区解析偏移；`getLocalPracticeDate` 对纯日期字符串短路返回。
- `syncToFirestore` 落库的 `lastPracticedAt` 取同步队列条目的 `timestamp`（即真实练习时刻），不要用同步时的 `new Date()`。
- 练习页的输入值在 `words.userInputs` 中，单词行是独立的 observer 组件（`WordRow`），只有对应行会随击键重渲染，不要在父组件渲染路径里读 `userInputs`。

## 多语言

- locale 持久化在 cookie（`locale=zh|en`）：`layout.tsx` 服务端读 cookie（无 cookie 时回退 `accept-language`）决定 `<html lang>` 并通过 `LocaleProvider` 下发初始 locale；`useLocale` 的 `getServerSnapshot` 用该初始值，保证 SSR 与客户端一致。不要再从 localStorage 或硬编码读取 locale。

## 造句练习与 DeepSeek 集成

- 造句/批改功能通过服务端 Route Handler（`src/app/api/sentence/*`）代理调用 DeepSeek，浏览器只请求本站 `/api/*`。
- `/api/*` 要求请求头携带 Firebase ID token（`Authorization: Bearer <token>`），由 `src/lib/serverAuth.ts` 通过 Identity Toolkit REST API 校验；校验通过返回 `{ uid }`，失败返回 401 的 NextResponse（用 `instanceof NextResponse` 区分）。
- `/api/*` 按 uid 限流（`src/lib/rateLimit.ts`），超限返回 429：配置了 `KV_REST_API_URL`/`KV_REST_API_TOKEN`（或 `UPSTASH_REDIS_REST_*`，Vercel Marketplace 装 Upstash Redis 后自动注入）时用 Upstash 全局限流；未配置或 Upstash 请求失败时回退进程内固定窗口限流（本地开发用）。`checkRateLimit` 是 async，调用时必须 await；新增 API 路由时应加上限流与输入长度上限。
- DeepSeek 封装位于 `src/lib/deepseek.ts`，读取环境变量 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`。
- API Key 只允许在服务端使用，禁止加 `NEXT_PUBLIC_` 前缀或下发到前端。
- 造句练习复用 `useFirestoreWords` 的单词库与 `recordCorrectAttempt`/`recordIncorrectAttempt`，练习结果计入单词熟练度并同步到 Firebase；造句场景没有真实输入计时，`recordCorrectAttempt(word)` 不传 `inputTimeSeconds`（该参数仅单词拼写练习传入），不要伪造输入时间以免抬高 speedScore。
- 批改接口返回 `usedWords`（用户实际用到的目标词，同义表达替代也算），客户端只对 `usedWords` 中的词调用 `recordCorrect/IncorrectAttempt`，未用到的目标词不记分；模型未返回该字段时回退为全部目标词。
- 同步队列（`src/lib/syncQueue.ts`）条目重试达到上限被丢弃时，`incrementRetries` 返回被丢弃条目，`syncToFirestore` 会 toast 提示用户（文案 `sync.dataLost`），不要改回静默丢弃。
- 造句题目界面不直接显示目标单词（答题后的反馈区才显示），这是有意设计：学生凭中文句子推断用词，因此造句请求会把词库中存的中文译法随目标词一并传给模型，prompt 要求中文译文自然地道、使用参考译法且能让学生反推出目标词；批改时对目标词的同义表达不判错、仅提示。
- 批改接口在调用模型前先对答案与参考译文做规范化判等（`src/lib/sentenceCompare.ts` 的 `normalizeForComparison`），完全一致直接返回满分，不消耗模型调用。
- 纯函数测试用 vitest（`bun run test`，配置在 `vitest.config.mts`），核心算法（熟练度、翻译解析、句意判等、日期处理）新增改动时应同步补测试。
