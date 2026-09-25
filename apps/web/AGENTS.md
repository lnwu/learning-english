# Learning English Web

本文件包含 `apps/web` 范围内必须遵守的规则与架构入口。深入设计见仓库根目录 `docs/`：`architecture/word-sync.md`（词库同步）、`architecture/sentence-deepseek.md`（造句/DeepSeek）、`WORD_FAMILIARITY_ALGORITHM.md`（熟练度）、`DEPLOYMENT.md`（部署与环境变量）。

本文中的 `app/`、`components/`、`hooks/`、`lib/` 等源码路径默认相对 `apps/web/src/`；其他路径均相对仓库根目录。仅当公共行为、数据格式、架构约束或项目不变量变化时，同步更新相关设计文档与本文件，纯实现细节调整无需机械更新。

## 硬规则

- API Key 只允许在服务端使用，禁止加 `NEXT_PUBLIC_` 前缀或下发到前端。
- `NEXT_PUBLIC_*` 必须用字面量 `process.env.NEXT_PUBLIC_X` 读取，不要用 `process.env[name]` 动态访问：Next 只在构建期内联字面量，动态访问在浏览器端恒为 undefined。
- 新增 `/api/*` 统一走 `lib/apiRoute.ts` 的 `withApiPost`（内部依次完成 `serverAuth`、`await checkRateLimit`、JSON 解析与 DeepSeek 错误映射），限额加进 `API_RATE_LIMITS`；输入校验用 `lib/apiInput.ts` 的 `parseBody` + 字段解析器（`requiredText`/`optionalText`/`wordToken`/`wordTokenList`/`wordList`/`sentenceWordList`）声明式描述形状与上限，缺省文案由 `badRequest` 统一生成；不要手写守卫三段、取字段/过滤/限长或错误尾巴。
- 带登录态调用 `/api/*` 统一使用 `lib/apiClient.ts` 的 `postJson<T>(url, payload, fallbackError)`，不要手写 token 与 fetch。
- Firestore 客户端访问统一经 `lib/wordsRepo.ts`（`WordsProvider` 按 effective uid 构造并注入），页面与组件不直接 import `firebase/firestore`；订阅仍只在 `WordsProvider` 中发生一次。
- 练习计时不能伪造：造句不传 `inputTimeSeconds`，仅单词拼写练习传入；`correctPracticeDates` 存 `YYYY-MM-DD` 本地日期字符串，不存 ISO 时间戳。
- 造句“每题一考”只按首次提交计分；重新批改只更新反馈，不改变计分。
- i18n 插值使用 `t(key, params)` 的 `{name}` 占位符，不要手写 `.replace`；英文表保持 `Record<TranslationKey, string>`，key 一致性由 `lib/i18n.test.ts` 守护。
- 中文不要通过 `next/font` 引入 Noto Sans SC，使用 `app/index.css` 中维护的系统字体栈。
- 不要删除 `app/error.tsx` 与 `app/global-error.tsx`。
- 修改翻译 prompt 或默认模型时，必须同步提升 `lib/translationCache.ts` 的缓存 key 前缀，避免长期复用旧释义。

## TypeScript 6/7 并排

- `typescript` 别名指向 `@typescript/typescript6`，向 typescript-eslint 与 Next 提供 JS API；`@typescript/native` 别名指向 TypeScript 7，提供 `bun x tsc`。不要移除别名或将 `typescript` 直接改为 `^7`。
- `apps/web/tsconfig.json` 必须保留 `"types": ["bun", "node"]`，否则测试文件无法解析 `bun:test`。
- typescript-eslint 支持 TypeScript 7 JS API 后，再切回单一 TypeScript 7 并删除本节。

## UI 组件与性能

- `apps/web/components.json` 是 shadcn/ui 配置来源；标准组件优先通过 `bun x shadcn@latest add <组件>` 添加，项目自有组件保留现有 API。添加后检查 import 使用 `@/lib/utils`、依赖 diff 与非标准改动，不把 CLI 的临时修补当作长期约定。
- Base UI 多态使用 `render` prop，不用 `asChild`；render 到非 button 元素时传 `nativeButton={false}`；动画使用 `data-open:animate-in` / `data-closed:animate-out`。
- toast 统一通过 `hooks/useToast.ts` 的 `toast({ title, variant })`；`<Toaster>` 保持经 `components/ui/toaster.tsx` 惰性加载，`WordPicker` 保持经 `word-picker/WordPickerLazy.tsx` 惰性加载。
- 非组件代码需要当前 locale 文案时，使用 `lib/i18n.ts` 的 `tNow(key, params)`。

## UI 风格

- 全站采用中性极简风格：白底平铺、1px 描边分层、普通卡片无阴影，彩色仅用于状态语义；浮层组件与 `StatTile` 的既有轻微阴影例外保留。样式只用语义 token，不使用原始调色板类、`bg-white` 或普通卡片阴影；具体 token 以 `app/index.css` 为准。
- 页面骨架统一使用 `PageContainer` 与 `PageHeader`；加载态使用 `LoadingState`，空态使用 `Empty`，危险操作使用 `Button variant="destructive"`。
- 数据可视化是彩色例外：熟练度条形色值用 `MASTERY_BAR_COLORS`（键为 `MasteryLevel`，新增等级时类型会强制补齐），热力图使用 `--heatmap-1..4`；不要在普通界面新增装饰色。等级门槛、顺序与文案 key 只有 `lib/masteryLevels.ts` 一份来源，页面与图表都从 `MASTERY_LEVELS` 取。
- 图标统一使用 lucide，按钮内图标使用 `data-icon="inline-start|inline-end"`；列表分隔使用 `divide-y` 或 `Separator`，间距使用 `gap-*`，不用 emoji、`space-x-*` 或 `space-y-*`。

## 词库状态管理

### 模块边界

- `lib/wordsLedger.ts` 的 `WordsLedger` 是练习旅程的唯一写入口：记分入队、快照合并、过期清理、分片提交、增删改/归一化/重置与同步状态都在这里；构造时注入模块级 `words` 单例、按 effective uid 构造的 `WordsRepo` 与 `QueueStorage`，不依赖 React 即可测试。
- `hooks/useFirestoreWords.tsx` 是 context 组合层：构造 ledger、用 `useSyncExternalStore` 订阅其状态、接线 30s 定时 / `visibilitychange` / `online` 触发与 toast，提供 `WordsProvider`、`useFirestoreWords`、`useSyncStatus`、`useWordsRepo`。
- `lib/queueStorage.ts` 是同步队列的存储端口（`load`/`get`/`save`/`removeByIds`/`clear`）：`createLocalStorageQueueStorage` 按 `sync_queue:{uid}:{wordId}` 每词一条并惰性迁移旧格式，`createMemoryQueueStorage` 供测试，`createNoopQueueStorage` 供未登录。去重、重试上限与过期判定属于 ledger 的策略，不要下沉进存储适配器。
- 纯逻辑位于 `lib/wordsStore.ts`、`lib/wordSync.ts`、`lib/wordNormalization.ts`、`lib/chunkedCommit.ts` 并配有测试；`lib/wordsRepo.ts` 是唯一接触 Firestore SDK 的模块（订阅、批量写、practiceTime），按 effective uid 构造并通过 `batchLimit` 暴露单次批量上限，`lib/firebase.ts` 惰性创建 app/db/auth（`getDb()`/`getAuthInstance()`）。动机与细节见 `docs/architecture/word-sync.md`。
- 单词文档的字段投影与解析集中在 `lib/wordDoc.ts`（`translationFields`/`newWordDocFields`/`practiceFields`/`attemptUpdateFields`/`resetPracticeFields`/`parseWordDoc`）：新增同步字段时只改 `WordData`、`SyncableWordData` 与这个文件，不要在调用方内联字段清单。`translation` 的字符串形态由 `lib/wordSenses.ts` 的 `encodeSenses`/`decodeSenses` 负责，写路径经 `translationFields` 编码，调用方只传结构化 `WordSense[]`。

### 必须保持的行为

- `useFirestoreWords()` 只返回稳定 context；高频变化的 `syncing` 与 `pendingCount` 只通过 `useSyncStatus()` 暴露。`Words` 的 `wordData` / `userInputs` 是私有字段，外部一律走 `wordCount`、`knownWords()`、`hasWord()`、`wordEntries()`、`getWordData()`（只读 `WordData`）以及 `getUserInput()`、`setUserInput()`、`clearUserInputs()`；字段使用 TypeScript `private`，不要使用 `#private`，否则 MobX observer 可能无法响应变化。
- 派生数据使用 `Words` computed getter；新增写入口必须同步失效 `#masteryCache`。练习数据重置走 `resetPracticeRecords()`，由 store 完成重置、缓存失效并返回待落库清单，不要在调用方原地修改 `WordData` 或手动调用 `invalidateCaches()`。
- `mergeSnapshotIntoStore` 必须保持增量合并及现有支配判定，不得改成全量替换 store 内容；stale 判定统一使用 `collectStaleQueueItemIds(merged, queue)`，不要混用快照与 `byId` 视图。`attemptHistory` 保留最近 30 条，老数据由 `parseWordDoc` 兜底，正确率回退全量统计。
- `lastPracticedAt` 使用同步队列条目的真实 `timestamp`，不得改用同步时的 `new Date()`。
- 分片提交使用 `commitInChunks`（纯执行器，`chunkSize` 取自 `WordsRepo.batchLimit`），Firestore 写入统一走 `lib/wordsRepo.ts` 的 `commitWordOperations`（按 `batchLimit` 分片、一次调用一个批次序列，保住归一化的原子性）；同步载荷、失败分类、过期队列和队列处置集中在 `lib/wordSync.ts` 的 `runWordSync`，由 `WordsLedger.sync()` 调用，不要内联回 hook。队列超过重试上限必须跨片汇总后只提示一次 `sync.dataLost`（ledger 递增 `dataLostCount`，provider 提示），localStorage 写失败回退内存必须提示 `sync.storageFailed`（存储适配器暴露 `usingMemoryFallback`，ledger 置 `storageFailed`）。
- `normalizeWordForms` 先 `syncToFirestore()` 并按计划落库，Firestore 成功后才更新 store；调整合并或上限语义时同步 `Words.MAX_*`。`updateTranslations` 先即时更新 store，再 batch 写 `translation`，由 `onSnapshot` 幂等合并兜底。
- 练习页输入判定使用 `lib/practiceInput.ts` 与单个 `inputStatesRef`；`WordRow` 保持独立 observer，父组件渲染路径不读 `words.userInputs`。
- `PracticeHeatmap` 保持 `memo`、只接收 `practiceTime`，网格构建使用 `useMemo`；纯网格、分档与记账逻辑（`PracticeTimeRecorder`）都位于 `lib/practiceTime.ts`。
- 练习时间由 `lib/practiceTime.ts` 的 `PracticeTimeRecorder` 记账（注入 `writeSeconds` 与时钟）：只在 visible + focus 时累计，每 60 秒把整秒用 `increment` 写入 `practiceTime/{YYYY-MM-DD}` 的 `seconds`，失败时把秒数放回池中重试，不足一秒的结余留到下次；`usePracticeTimeTracker` 只接线事件与定时器。
- `lib/firebase.ts` 惰性创建实例（首次 `getDb()`/`getAuthInstance()` 时才校验 env 并初始化），Firestore 使用 `initializeFirestore`、`persistentLocalCache` 与 `persistentMultipleTabManager`；不要在服务端组件直接读写 `db`。

## 双击选词添加

- 任意页面双击英文单词打开 `AddWordDialog`；取词与校验逻辑位于 `lib/wordSelection.ts`。监听跳过 `input` / `textarea` / `select` / `[contenteditable]` 与 `[data-slot="dialog-content"]`，未登录时忽略。
- `AddWordDialog` 与 `/add-word` 共用，不复制“调用 `/api/translate` + 确认弹窗”流程；调用方先执行 `checkWordAddable`，客户端不推断原形。
- 默认保存 `lemma` 原形；切换按钮只在两者不同时出现。原形已存在时进入 `exists` 状态，确认后才调用 `onFinished`；`handleConfirmAdd` 必须按最终选词再次校验。

## Profile 与批量 AI 操作

- `profile/page.tsx` 只保留账号、语言、热力图、统计、熟练度、单词列表及删除/重置确认；批量 AI 操作放在 `profile/ProfileAiSection.tsx`。
- 归一化链路为 `/api/normalize-words`（每批不超过 50）→ `resolveRenamePlan` → `normalizeWordForms`；消息构造与解析位于 `lib/normalizeWords.ts`，lemma 清洗复用 `lib/lemma.ts`。
- 重新生成释义调用 `/api/regenerate-definitions`（每批不超过 50）；`senses: null` 的词保留原释义，只通过 `updateTranslations` 修改 `translation`，不触碰练习数据；前端串行分批并显示进度。
- 两条批量流程共用 `lib/batchAiTask.ts` 的 `runBatchedAiTask`（串行分批、进度回调、单批失败不中断），失败单词数用 `countFailedWords` 统计；部分批次失败必须提示（`profile.regeneratePartial` / `profile.normalizePartial`），不要静默当成全部成功。熟练度均值与分布用 `lib/masteryStats.ts`，热力图月份文案用 `lib/practiceTime.ts` 的 `formatPracticeMonthLabel`。

## 多语言

- locale 持久化在 `locale=zh|en` cookie；`layout.tsx` 服务端读取 cookie，缺失时回退 `accept-language`，再通过 `LocaleProvider` 下发初始值。`useLocale` 的 `getServerSnapshot` 使用同一值保证 SSR/客户端一致，不使用 localStorage。
- `useLocale` 返回的 `t(key, params)` 支持占位符插值；locale 版本签名为 `t(key, locale, params)`。

## 造句与 DeepSeek

- 浏览器只请求本站 `/api/*`，由服务端代理 DeepSeek；`serverAuth` token 缓存、`await checkRateLimit` 与 `lib/deepseek.ts` 的重试/错误映射语义受测试保护，修改时同步测试。
- 路由骨架统一 `withApiPost`；translate 的 prompt 与解析在 `lib/wordLookup.ts`，造句生成/批改的 prompt 与解析在 `lib/sentenceMessages.ts`（批改响应会夹取 `score`、截断超长字段、过滤 `issues`），批改结果（含「完全相同直接满分」快路径与 `usedWords` 回退）都由该文件构造，路由只做取参与返回。
- 造句抽词策略（练习次数达标的词优先、少练的补位、数量在 2-3 之间随机）在 `lib/sentenceWords.ts`（纯函数 + 测试）；单词数下限统一用 `MIN_SENTENCE_WORDS`，不足时 hook 置 `insufficientWords` 布尔状态（不要再用字符串哨兵），错误文案走 `tNow`。
- 限流与缓存的 Redis 客户端统一使用 `lib/redis.ts` 的 `getRedis()`；未配置 Upstash 时仅在本地开发回退进程内实现。
- 义项清洗统一使用 `lib/wordSenses.ts` 的 `sanitizeWordSenses`，由翻译与重新生成释义接口共用；`WordSense` 类型、编码（`encodeSenses`）与解析（`decodeSenses`，含旧格式兼容）也都在这个文件。
- 批改前判等与满分快路径统一走 `lib/sentenceMessages.ts` 的 `isExactMatchAnswer` + `buildExactMatchResult`（内部复用 `lib/sentenceCompare.ts` 的 `normalizeForComparison`/`resolveUsedWords`），与模型批改路径产出同一份 `CheckResult`；`usedWords` 缺失时回退全部目标词的语义只在 `sanitizeUsedWords`/`buildExactMatchResult` 一处，客户端直接用响应里的 `usedWords`，不要自带回退。
- 造句复用词库与 `recordCorrect` / `recordIncorrectAttempt` 计分；答案输入使用 `Textarea`，Enter 提交、Shift+Enter 换行，`onKeyDown` 必须检查 `isComposing`。
- 纯函数测试使用 `bun:test`。熟练度、翻译解析、句意判定、日期、同步合并等核心算法修改时同步补测试；统一验证入口为仓库根目录 `bun run test`。
