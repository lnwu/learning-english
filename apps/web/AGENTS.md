# Learning English Web

本文件包含 AI 在本项目中工作时必须遵守的规则和项目信息。

## TypeScript 6/7 并排

- TypeScript 采用官方并排方案（2026-09）：`typescript` 别名指向 `@typescript/typescript6`（TS6 JS API，供 typescript-eslint 与 Next 使用），`@typescript/native` 别名指向 `typescript@7`（提供 TS7 的 `tsc` 可执行文件）。因此 `bun x tsc` 是 TS 7.0.x，而 `next build` 的类型检查走 TS6 API；不要移除任一别名或把 `typescript` 直接改成 `^7`，否则 typescript-eslint 会因 TS7 没有 JS API 而崩溃。
- `tsconfig.json` 必须保留 `"types": ["bun", "node"]`：TS 6/7 起 `types` 默认是 `[]`，不再自动加载 `@types/*`，去掉后测试文件会报 `Cannot find module 'bun:test'`。
- TypeScript 7.1 提供新 API 且 typescript-eslint 支持后（tracking: typescript-eslint#10940），切回单一 `typescript@^7` 并移除本节的并排说明。

## UI 组件

- `src/components/ui` 是 shadcn/ui 风格组件，底层原语是 **Base UI**（`@base-ui/react`，2026-08 从 Radix 迁移完成，报告在仓库根 `.migration/`）。`components.json` 的 style 为 **`base-nova`**：标准组件（button/dialog/input/alert/sonner）用 `bun x shadcn@latest add <组件> --overwrite` 从官方注册表生成；项目自有组件（confirm-dialog/frequency-bar/sync-indicator）手写，改动时保留现有 API。
- toast 用 sonner：`src/components/ui/sonner.tsx`（官方 Toaster，`next-themes` 取主题），业务侧通过 `src/hooks/useToast.ts` 的 `toast({ title, variant })` 调用（映射到 `toast.success/.error`），`richColors` 提供着色，`<Toaster>` 挂载在 `layout.tsx`。
- 带登录态调 `/api/*` 统一用 `src/lib/apiClient.ts` 的 `postJson<T>(url, payload, fallbackError)`（自动取 ID token、解析错误 JSON），不要在手写 token + fetch 的重复逻辑；目前 `useSentencePractice`、`AddWordDialog`、Profile 页批量释义均已接入。
- 全局错误兜底：`src/app/error.tsx` 与 `src/app/global-error.tsx` 已存在，未捕获渲染异常不会白屏；不要删除。
- Base UI 惯例：多态用 `render` prop（不用 radix 的 `asChild`）；render 到非 button 元素时传 `nativeButton={false}`；动画用 keyframe 写法 `data-open:animate-in`/`data-closed:animate-out`（不用 `data-[state=...]`）。
- 字体：Inter（`next/font` 的 `--font-sans`）只覆盖拉丁字符；中文使用系统字体栈（PingFang SC / 微软雅黑 / Noto Sans CJK），不要再通过 `next/font` 引入 Noto Sans SC，三个字重会产生约 4.5MB 的 CJK 切片资源（`index.css` 的 `body` font-family 已按此约定维护）。

## 词库状态管理

- `src/lib/wordsStore.ts`：`Words` MobX store 类与 `mergeSnapshotIntoStore`/`parseWordDoc`/`isWordDataEqual` 等纯逻辑，不依赖 Firebase 运行时，配套测试 `wordsStore.test.ts`；`src/hooks/useFirestoreWords.tsx` 持有模块级单例并负责 Firestore 订阅与同步。`WordsProvider`（挂在根 layout）在登录后全局只做一次 `onSnapshot` 订阅，`useFirestoreWords` 只是读 Context，不要在页面里再订阅 Firestore。
- 熟练度结果通过 `#masteryCache` 缓存（随 `recordCorrect/IncorrectAttempt`、`setWordData`/`deleteWord`/`removeAllWords` 失效），全量统计用 computed getter（`overallAverageInputTime`、`averageTimeByLengthCategory`、`practiceStats`），新增派生数据时优先用 computed getter 而非每次渲染重算。
- Firestore `onSnapshot` 结果通过 `mergeSnapshotIntoStore(store, snapshot, pending)` 增量合并到 store（仅更新变化单词、只对变化词局部失效缓存），第三个参数是本地同步队列的待写数据：远端在 `totalAttempts`/`correctCount` 两个维度都不低于本地且至少一个更高（支配本地）时用远端，否则用本地覆盖，避免未同步的练习记录被旧快照回退；返回值 `{ byWord, byId }` 中 `byId` 是未叠加队列的 Firestore 原始数据，供 `isQueueItemStale` 判断队列条目是否已被远端覆盖（远端支配本地、或可同步字段完全一致才算 stale；计数打平但数组不同时保留本地，防止丢练习日期）。不要改成全量替换 `wordData`，否则会导致所有 observer 组件无谓重渲染。
- `correctPracticeDates` 存 `YYYY-MM-DD` 本地日期字符串（`formatLocalPracticeDate`），不要存 ISO 时间戳，避免时区解析偏移；`getLocalPracticeDate` 对纯日期字符串短路返回。
- `attemptHistory` 存最近 30 条练习对错序列（`true`/`false`），随 `recordCorrectAttempt`/`recordIncorrectAttempt` 更新并随同步队列落库；老数据没有该字段时 `parseWordDoc` 兜底为空数组，熟练度正确率回退为全量统计。
- `syncToFirestore` 落库的 `lastPracticedAt` 取同步队列条目的 `timestamp`（即真实练习时刻），不要用同步时的 `new Date()`。
- 批量更新释义用 `updateTranslations(updates)`：先 `setWordData` 即时更新 store（失效缓存），再按 wordId 用 `commitBatchOperations` 写 Firestore（onSnapshot 幂等合并）。同步批次聚合与入队载荷构造在 `src/lib/wordSync.ts`（`buildWordUpdates`/`buildAttemptQueueData`，配套测试），不要再写回 hook 内联。
- 练习页的输入值在 `words.userInputs` 中，单词行是独立的 observer 组件（`WordRow`），只有对应行会随击键重渲染，不要在父组件渲染路径里读 `userInputs`。
- 单词拼写练习的输入判定抽在 `src/lib/practiceInput.ts`（`evaluatePracticeInput`，配套测试）：一轮内首字符开始计时；输入与单词完全一致即标记 `completed`，之后继续多打、清空重打都不再记录对错；正确只在首次达成且有计时时记录一次（防止答对后清空重打刷分），错误按「删到长度不足后可再记」去重；页面用单个 `inputStatesRef` 保存每词状态，不要退回多个 ref 分散判断。

## 双击选词添加（Word Picker）

- 全站任意页面双击英文单词会弹出添加确认弹窗（`src/components/word-picker/WordPicker.tsx` 在根 layout 挂载监听 `dblclick`，用 `window.getSelection()` 取词）。交互与词库校验的纯逻辑在 `src/lib/wordSelection.ts`（`extractWordFromSelection`/`checkWordAddable`，配套测试）。
- 添加弹窗复用共享组件 `src/components/word-picker/AddWordDialog.tsx`（翻译 → 展示义项 → 确认落库），`/add-word` 页面与全局双击入口共用，不要在别处再复制「调 `/api/translate` + 确认弹窗」逻辑。弹窗内部只做翻译与落库，已存在/非法字符的预校验由调用方（页面或 `WordPicker`）先用 `checkWordAddable` 完成。
- 双击监听需跳过 `input/textarea/select/[contenteditable]` 与弹窗自身（`[data-slot="dialog-content"]`），未登录时忽略；不要在这些区域或未登录场景触发。

## 每日练习时间统计

- `src/hooks/usePracticeTimeTracker.ts` 挂载在 `/words` 与 `/sentence` 页面：仅当 `document.visibilityState === 'visible'` 且 `document.hasFocus()` 时计时（纯逻辑在 `src/lib/practiceTime.ts` 的 `ActiveTimeTracker`，配套测试；`formatPracticeDuration` 负责中英格式化）。每 60s 及页面隐藏/卸载时把累计秒数用 Firestore `increment` 原子累加写入 `users/{userId}/practiceTime/{YYYY-MM-DD}`（文档 ID 为本地日期，字段为 `seconds`），写失败时把秒数放回待累计池下次重试。
- Profile 页用 `getDocs` 读取全部 `practiceTime` 文档，以 GitHub Contributions 风格热力图展示（N 周 × 7 天网格，周数由 `ResizeObserver` 按容器宽度自适应、上限 53 周，避免横向滚动；月份标签、少→多图例）；热力图 UI 独立在 `src/app/profile/PracticeHeatmap.tsx`（`memo` 子组件，仅接收 `practiceTime`，避免搜索输入等无关重渲染波及 371 格网格），改动热力图时保持该隔离。网格构建与分档纯逻辑在 `practiceTime.ts`（`buildPracticeTimeWeeks`/`getPracticeTimeLevel`/`getPracticeTimeMonthLabels`，配套测试），不做实时订阅；该子集合的 Firestore 规则与 `words` 一致（本人读写、preview 匿名可写）。

## 多语言

- locale 持久化在 cookie（`locale=zh|en`）：`layout.tsx` 服务端读 cookie（无 cookie 时回退 `accept-language`）决定 `<html lang>` 并通过 `LocaleProvider` 下发初始 locale；`useLocale` 的 `getServerSnapshot` 用该初始值，保证 SSR 与客户端一致。不要再从 localStorage 或硬编码读取 locale。
- `t()` 支持占位符参数：`t(key, locale, params)`（`useLocale` 返回的 `t` 为 `t(key, params)`），占位符写法 `{name}`（如 `profile.deleteConfirm` 的 `{word}`、`profile.regeneratePartial` 的 `{success}/{skipped}`）；需要插值时传 params，不要手写 `.replace('{xxx}', ...)`。en 表以 `Record<TranslationKey, string>` 约束，缺 key 会编译报错；key 一致性与占位符匹配由 `src/lib/i18n.test.ts` 守护。

## 造句练习与 DeepSeek 集成

- 造句/批改功能通过服务端 Route Handler（`src/app/api/sentence/*`）代理调用 DeepSeek，浏览器只请求本站 `/api/*`。
- `/api/*` 要求请求头携带 Firebase ID token（`Authorization: Bearer <token>`），由 `src/lib/serverAuth.ts` 通过 Identity Toolkit REST API 校验；校验通过返回 `{ uid }`，失败返回 401 的 NextResponse（用 `instanceof NextResponse` 区分）。校验结果按 token 进程内缓存，上限 1000 条、超出淘汰最旧，防止长驻实例内存无界增长。
- `/api/*` 按 uid 限流（`src/lib/rateLimit.ts`），超限返回 429：配置了 `KV_REST_API_URL`/`KV_REST_API_TOKEN`（或 `UPSTASH_REDIS_REST_*`，Vercel Marketplace 装 Upstash Redis 后自动注入）时用 Upstash 全局限流；未配置或 Upstash 请求失败时回退进程内固定窗口限流（本地开发用）。`checkRateLimit` 是 async，调用时必须 await；新增 API 路由时应加上限流与输入长度上限。
- DeepSeek 封装位于 `src/lib/deepseek.ts`，读取环境变量 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`；`chatCompletionJson` 支持可选 `temperature`（默认 0.7），对网络错误与 429/5xx 自动重试一次，超时（504）不重试以免总耗时翻倍，非 JSON 响应统一归类为 `DeepSeekError(502)`，配套测试 `deepseek.test.ts`。
- `/api/translate` 由 DeepSeek 一次调用生成结构化义项数组 `senses: [{ pos, chinese, english }]`（2~4 个义项，最常用在前），不再使用 Google Translate/Datamuse 等外部免费源或回退词典（`lib/dictionary.ts` 已删除）；模型判定非有效单词时返回 `senses: null`（前端提示未识别），调用失败时返回错误且前端不落库。义项字段校验与清洗统一在 `src/lib/senses.ts`（`sanitizeWordSenses` 与长度上限），`/api/translate` 与 `regenerateDefinitions` 共用，不要再各写一份。翻译缓存（`src/lib/translationCache.ts`）L1 为进程内 LRU、配置 Upstash 时 L2 为 Redis（30 天 TTL，key 前缀 `translation:v1`；改动 translate 的 prompt 或默认模型时同步 bump 版本前缀，避免旧释义长期复用），只存 `senses` 非空数组的成功结果；Redis 客户端统一用 `src/lib/redis.ts` 的 `getRedis()`（限流同源）。前端用 `src/lib/parseTranslation.ts` 的 `formatSenses` 把 `senses` 拼成「每义项一行（词性+中文 — 英文）」存入 `translation` 字段，`parseTranslation` 兼容旧格式（首行英文、其余中文）。
- API Key 只允许在服务端使用，禁止加 `NEXT_PUBLIC_` 前缀或下发到前端。
- 造句练习复用 `useFirestoreWords` 的单词库与 `recordCorrectAttempt`/`recordIncorrectAttempt`，练习结果计入单词熟练度并同步到 Firebase；造句场景没有真实输入计时，`recordCorrectAttempt(word)` 不传 `inputTimeSeconds`（该参数仅单词拼写练习传入），不要伪造输入时间以免抬高 speedScore。`calculateMasteryScore` 对无计时数据的词让速度/稳定性因子不参与加权（避免纯造句词被压级），详见 `docs/WORD_FAMILIARITY_ALGORITHM.md`。
- 批改接口返回 `usedWords`（用户实际用到的目标词，同义表达替代也算），客户端只对 `usedWords` 中的词调用 `recordCorrect/IncorrectAttempt`，未用到的目标词不记分；模型未返回该字段时回退为全部目标词。造句是「每题一考」：同一道题只按首次提交的结果计分（`useSentencePractice` 的 `scoredQuestionRef` 去重，防止重复提交刷熟练度），提交后页面锁定答案、隐藏提交按钮，只能看反馈或换下一题，不要改回可重复计分。
- 同步队列（`src/lib/syncQueue.ts`）按 uid 隔离、每个条目独立存一个 key（`sync_queue:{uid}:{wordId}`，旧的整体数组格式会在 `setUser` 时自动迁移），不同单词的写入不会互相覆盖，避免多标签页 read-modify-write 互相丢条目；登录/登出由 `useFirestoreWords` 负责切换并在登出时清空 store 与队列，切换账号不会把旧账号的 wordId 写到新账号路径下。`addToQueue` 同一 wordId 覆盖为最新一条（重试计数归零，已有条目的尝试次数更多时直接忽略较低计数的写入，防止旧标签页回退进度）。条目重试达到上限被丢弃时，`incrementRetries` 返回被丢弃条目，`syncToFirestore` 会 toast 提示用户（文案 `sync.dataLost`），不要改回静默丢弃。远端已删除的单词（`batch.update` 返回 `not-found` 且 store 已加载确认该词不存在）直接丢弃对应队列条目、不重试不提示；其余失败仍走重试与提示。localStorage 写失败时队列自动回退到内存副本（`hasMemoryFallback()`）并 toast 提示（文案 `sync.storageFailed`）。
- 造句题目界面不直接显示目标单词（答题后的反馈区才显示），这是有意设计：学生凭中文句子推断用词，因此造句请求会把词库中存的中文译法随目标词一并传给模型，prompt 要求中文译文自然地道、使用参考译法且能让学生反推出目标词；批改时对目标词的同义表达不判错、仅提示。
- 批改接口在调用模型前先对答案与参考译文做规范化判等（`src/lib/sentenceCompare.ts` 的 `normalizeForComparison`），完全一致直接返回满分，不消耗模型调用；用户实际用到的目标词由同文件的 `resolveUsedWords`/`sanitizeUsedWords` 计算（配套测试），不要在路由里内联重复实现。
- `/api/regenerate-definitions` 批量重新生成释义：请求 `{ words: string[] }`（每批上限 50，服务端会过滤掉非小写字母或超长词并去重，合法词为空时 400），一次 DeepSeek 调用返回 `{ results: [{ word, senses }] }`；纯逻辑在 `src/lib/regenerateDefinitions.ts`（`buildRegenerateMessages`/`parseRegenerateResults`，配套测试），未识别或非法的词 `senses` 为 `null`，前端保留原释义。Profile 页「AI 重新生成释义」前端串行分批调用并显示进度，通过 `useFirestoreWords` 的 `updateTranslations`（store 即时更新 + Firestore batch 写 `translation`）落库，不改动练习数据。
- 纯函数测试用 bun test（`bun:test`，`bun run test`），核心算法（熟练度、翻译解析、句意判等、日期处理）新增改动时应同步补测试。
