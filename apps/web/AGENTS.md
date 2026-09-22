# Learning English Web

本文件包含 AI 在本项目中工作时必须遵守的规则和项目信息。设计动机与背景在 `docs/`：`architecture/word-sync.md`（词库同步）、`architecture/sentence-deepseek.md`（造句/DeepSeek）、`WORD_FAMILIARITY_ALGORITHM.md`（熟练度）、`DEPLOYMENT.md`（部署与环境变量）。**改代码后本文件与这些文档要成对更新。**

## 硬规则

- API Key 只允许在服务端使用，禁止加 `NEXT_PUBLIC_` 前缀或下发到前端。
- 新增 `/api/*` 必须：`serverAuth` 校验 ID token + `await checkRateLimit` + 输入长度上限。
- 带登录态调 `/api/*` 统一用 `lib/apiClient.ts` 的 `postJson<T>(url, payload, fallbackError)`，不要手写 token + fetch。
- Firestore 客户端**只在 `WordsProvider` 订阅**（登录后单次 `onSnapshot`），页面里不要自己订阅。
- 练习计时不能伪造：造句不传 `inputTimeSeconds`（仅单词拼写练习传入）；`correctPracticeDates` 存 `YYYY-MM-DD` 本地日期字符串，不存 ISO 时间戳。
- 造句「每题一考」只按首次提交计分，不要改回可重复计分；重新批改只更新反馈、不改变计分。
- locale 只从 cookie 读（layout 服务端决定），不要用 localStorage 或硬编码。
- i18n 插值用 `t(key, params)` 占位符（`{name}`），不要手写 `.replace`；en 表是 `Record<TranslationKey, string>`，缺 key 编译报错，key 一致性由 `lib/i18n.test.ts` 守护。
- 中文不要用 `next/font` 引 Noto Sans SC（三个字重约 4.5MB CJK 切片），用系统字体栈（`index.css` 的 `body` 已按此维护）。
- 不要删除 `src/app/error.tsx` 与 `global-error.tsx`（全局错误兜底）。
- 改 Firestore 写入字段必须成对修改 `infra/modules/firebase/firestore.rules` 的字段校验，否则线上写入被拒（见 `infra/AGENTS.md`）。
- 改 translate 的 prompt 或默认模型必须 bump 翻译缓存 key 前缀（当前 `translation:v2`），否则旧释义长期复用。

## TypeScript 6/7 并排

- TypeScript 采用官方并排方案（2026-09）：`typescript` 别名指向 `@typescript/typescript6`（TS6 JS API，供 typescript-eslint 与 Next 使用），`@typescript/native` 别名指向 `typescript@7`（提供 TS7 的 `tsc` 可执行文件）。因此 `bun x tsc` 是 TS 7.0.x，而 `next build` 的类型检查走 TS6 API；不要移除任一别名或把 `typescript` 直接改成 `^7`，否则 typescript-eslint 会因 TS7 没有 JS API 而崩溃。
- `tsconfig.json` 必须保留 `"types": ["bun", "node"]`：TS 6/7 起 `types` 默认是 `[]`，不再自动加载 `@types/*`，去掉后测试文件会报 `Cannot find module 'bun:test'`。
- TypeScript 7.1 提供新 API 且 typescript-eslint 支持后（tracking: typescript-eslint#10940），切回单一 `typescript@^7` 并移除本节的并排说明。

## UI 组件

- `components/ui` 底层原语是 Base UI（`base-nova` 样式）：标准组件（button/dialog/input/alert/sonner）用 `bun x shadcn@latest add <组件> --overwrite` 从官方注册表生成；项目自有组件（confirm-dialog/frequency-bar/sync-indicator）手写，改时保留现有 API。⚠️ `--overwrite` 会覆盖手改内容，重生成 dialog/sonner 后必须检查非标准改动是否还在。
- Base UI 惯例：多态用 `render` prop（不用 `asChild`）；render 到非 button 元素时传 `nativeButton={false}`；动画用 `data-open:animate-in`/`data-closed:animate-out`（不用 `data-[state=...]`）。
- toast 通过 `hooks/useToast.ts` 的 `toast({ title, variant })`（映射 sonner）；`<Toaster>` 挂在 layout 且是惰性组件（`ui/toaster.tsx` 的 `dynamic(ssr:false)`），`WordPicker` 同理经 `word-picker/WordPickerLazy.tsx` 挂载——不要改回静态 import，会把 sonner/选词逻辑塞回首屏。
- 非组件代码要当前 locale 的文案用 `lib/i18n.ts` 的 `tNow(key, params)`。

## 词库状态管理

架构：`hooks/useFirestoreWords.tsx` 是 context 组合层（模块级单例 `words`、`WordsProvider`、`useFirestoreWords`、`useSyncStatus`）；`hooks/useWordsSync.ts` 负责订阅、同步触发与记分入队，`hooks/useWordActions.ts` 负责增删改、归一化、重置；纯逻辑在 `lib/{wordsStore,wordSync,wordNormalization,firestoreBatch}.ts`，全部有 `*.test.ts`。动机与细节见 `docs/architecture/word-sync.md`。要守的行为：

- `useFirestoreWords()` 只读稳定 context；高频变化的 `syncing`/`pendingCount` 走独立的 `useSyncStatus()`——不要把这两个加回主 context（会让所有消费者随每次记分重渲染）。
- 新增派生数据用 `Words` 的 computed getter，不要每次渲染重算；熟练度结果由 `#masteryCache` 缓存且已随现有写入口失效，新增写入口时必须同样失效缓存。
- 快照合并 `mergeSnapshotIntoStore` 是增量合并，**不要改成全量替换 `wordData`**（所有 observer 会无谓重渲染），也不要改支配判定语义（会丢练习数据）。
- `attemptHistory` 存最近 30 条对错序列；老数据缺字段由 `parseWordDoc` 兜底空数组，正确率回退全量统计。`lastPracticedAt` 落库取同步队列条目的 `timestamp`（真实练习时刻），不要用同步时的 `new Date()`。
- 批量写一律走 `commitBatchOperations`（`lib/firestoreBatch.ts`，500/批）；同步载荷构造、失败分类、过期队列判定在 `lib/wordSync.ts`，归一化落库计划在 `lib/wordNormalization.ts`（均有测试），不要内联回 hook。
- 队列条目重试到上限被丢弃必须 toast `sync.dataLost`；localStorage 写失败回退内存必须 toast `sync.storageFailed`——都不要改成静默丢弃。
- `normalizeWordForms`：先 `syncToFirestore()`，按计划落库，Firestore 提交成功后才 `words.moveWord` 更新 store，返回 `{ renamed, merged }`；`mergeWordData` 的合并与上限语义调整时同步 `Words.MAX_*` 与 rules 校验上限。
- `updateTranslations`：先 `setWordData` 即时更新 store（失效缓存）再 batch 写 `translation`，onSnapshot 幂等合并兜底。
- 练习页输入判定用 `lib/practiceInput.ts` + 单个 `inputStatesRef`（有测试，语义见 `docs/architecture/word-sync.md`）；`WordRow` 是独立 observer，父组件渲染路径不要读 `words.userInputs`。
- 热力图 `PracticeHeatmap` 保持隔离（`memo`、只接收 `practiceTime`、网格构建已 `useMemo`）；网格与分档纯逻辑在 `lib/practiceTime.ts`（有测试）。
- 练习时间 tracker 只在 visible+focus 计时，每 60s 用 `increment` 写 `practiceTime/{YYYY-MM-DD}` 的 `seconds`，写失败把秒数放回池下次重试。
- `lib/firebase.ts` 用 `initializeFirestore` 配 `persistentLocalCache` + `persistentMultipleTabManager`（多标签页共享缓存）；SSR 只创建实例不发起操作，不要在服务端组件里直接用 `db` 读写。

## 双击选词添加（Word Picker）

- 任意页面双击英文单词弹添加确认弹窗；取词与校验纯逻辑在 `lib/wordSelection.ts`（`extractWordFromSelection`/`checkWordAddable`，有测试）。双击监听跳过 `input/textarea/select/[contenteditable]` 与弹窗自身（`[data-slot="dialog-content"]`），未登录忽略。
- 添加弹窗 `AddWordDialog` 与 `/add-word` 页共用，不要在别处复制「调 `/api/translate` + 确认弹窗」逻辑；预校验由调用方先 `checkWordAddable`，客户端不做原形推断。
- 默认保存 `lemma` 原形：标题「原词 → 原形」，切换按钮只在两者不同时出现；原形已存在时弹窗切 `exists` 态（不自动关闭、不弹 toast），点 `gotIt` 才走 `onFinished`；`handleConfirmAdd` 按最终选中的词再校验一次。

## Profile 页与批量 AI 操作

- 结构：父页面（`profile/page.tsx`）只留账号信息、语言切换、热力图、统计、熟练度分布、单词列表（`WordPerformanceSection`）与删除/重置确认；「AI 重新生成释义」「归一化词形」的按钮、进度、确认弹窗独立在 `profile/ProfileAiSection.tsx`，不要把批量逻辑塞回父页面。
- 归一化链路：`/api/normalize-words`（≤50/批）→ `resolveRenamePlan` → `normalizeWordForms`；消息构造与解析在 `lib/normalizeWords.ts`（有测试），lemma 清洗复用 `lib/lemma.ts`。
- 重新生成释义：`/api/regenerate-definitions`（≤50/批），`senses: null` 的词保留原释义；通过 `updateTranslations` 落库，只改 `translation` 不碰练习数据；前端串行分批并显示进度。

## 多语言

- locale 持久化在 cookie（`locale=zh|en`）：`layout.tsx` 服务端读 cookie（无则回退 `accept-language`）决定 `<html lang>` 并经 `LocaleProvider` 下发初始值；`useLocale` 的 `getServerSnapshot` 用同一初始值保证 SSR/客户端一致。
- `useLocale` 返回的 `t(key, params)` 支持占位符插值（见硬规则）；`t()` 的 locale 版本签名是 `t(key, locale, params)`。

## 造句练习与 DeepSeek 集成

架构、动机与「有意为之」的交互设计（题面不显示目标词、每题一考、重新批改、usedWords 计分、不传计时）见 `docs/architecture/sentence-deepseek.md`，本节只列硬性约定：

- 浏览器只请求本站 `/api/*`，服务端代理 DeepSeek；`serverAuth` 的 token 缓存、`rateLimit` 必须 `await`、`deepseek.ts` 的重试语义（网络/429/5xx 重试一次、504 不重试、非 JSON 归 502）均有测试，改时同步。
- 限流与缓存的 Redis 客户端统一用 `lib/redis.ts` 的 `getRedis()`；未配置 Upstash 时回退进程内实现（本地开发）。
- 义项清洗统一 `lib/senses.ts` 的 `sanitizeWordSenses`，`/api/translate` 与 `regenerate-definitions` 共用，不要再各写一份。
- 批改前先 `lib/sentenceCompare.ts` 的 `normalizeForComparison` 规范化判等（完全一致直接满分、省模型调用）；`resolveUsedWords`/`sanitizeUsedWords` 同文件有测试，不在路由内联重复实现。
- 造句复用词库与 `recordCorrect/IncorrectAttempt` 计分；答案输入用 `Textarea`（Enter 提交、Shift+Enter 换行），`onKeyDown` 必须检查 `isComposing` 防中文输入法回车误提交。
- 纯函数测试用 bun test（根目录 `bun run test`）；核心算法（熟练度、翻译解析、句意判等、日期、同步合并）新增改动时同步补测试。
