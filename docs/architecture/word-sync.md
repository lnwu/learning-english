# 词库同步与状态管理设计

本文记录 words 数据流的**设计动机与背景**；必须遵守的行为规则在 `apps/web/AGENTS.md`。熟练度字段的语义、上限与合并规则见 `docs/WORD_FAMILIARITY_ALGORITHM.md`。实现分布：`src/lib/wordsLedger.ts`（`WordsLedger`：记分入队、快照合并、过期清理、分片提交、增删改/归一化/重置与状态，不依赖 React）、`src/hooks/useFirestoreWords.tsx`（context 组合层：构造 ledger、订阅状态、接线定时/可见性/online 触发与提示）、`src/lib/{wordsStore,wordSync,wordNormalization,chunkedCommit}.ts`（纯逻辑，均有测试）、`src/lib/queueStorage.ts`（同步队列存储端口与适配器）、`src/lib/wordsRepo.ts`（唯一接触 Firestore SDK 的模块）、`src/lib/firebase.ts`（惰性 app/db/auth）。

## 数据模型

- `users/{uid}/words/{docId}`：字段 `word`/`translation`/`memory`/`stats`/`inputTimes`/`reviews`/`createdAt`；`memory` 是 DSR 记忆状态，`stats` 是复习统计，`reviews` 是复习日志。文档 id 是 addDoc 自动 id，不是单词本身（归一化重命名时要保留 id 就是为此）。
- `users/{uid}/practiceTime/{YYYY-MM-DD}`：`{ seconds }`，每天一个文档。
- preview 环境读写 `users/preview/*`，设计见根 AGENTS.md；安全规则只做鉴权、不做字段校验，见 `infra/AGENTS.md`。
- 客户端所有 Firestore 读写都经 `lib/wordsRepo.ts`：repo 在构造时捕获 effective uid（preview 环境映射为 `preview`），调用方无法传错 uid；订阅、批量写与 practiceTime 递增都收在这一处，ledger 与页面不再 import `firebase/firestore`。
- 文档字段的投影与解析集中在 `lib/wordDoc.ts`：新词文档（`newWordDocFields`）、释义落库（`translationFields`）、队列/同步载荷（`practiceFields`）、落库更新（`attemptUpdateFields`）、重置（`resetPracticeFields`）与解析兜底（`parseWordDoc`）都从这里取；新增同步字段时改 `WordData`、`SyncableWordData` 与这个文件即可，不要在调用方内联字段清单。

## 订阅与快照合并

- `WordsLedger.start()` 登录后只做一次 `onSnapshot`（全集合）：多处订阅会对同一集合重复收快照、重复触发合并。
- `mergeSnapshotIntoStore` **增量**合并：只更新有变化的词、只对变化词触发 store 更新。全量替换会让所有 observer 组件无谓重渲染（WordRow 一行一组件，词库几百条时明显）。
- 快照合并会叠加本地同步队列的 pending 数据，动机是**防止未同步的复习被旧快照回退**：远端 `memory.lastReviewAt` 晚于队列时才用远端，否则把队列数据合并进 store（记忆状态按 `lastReviewAt`、统计逐项取大、复习日志按 id 并集）。返回值里的 `byId` 是不叠加队列的远端原始数据，供队列 stale 判定使用——两个视图不要合并：stale 判定统一走 `collectStaleQueueItemIds(merged, queue)`，由函数内部取 `byId`，调用方无法传错视图。
- `Words` 的 `wordData`/`userInputs` 是私有字段（TS `private`，不能是 `#`，否则 MobX 观测不到），对外只暴露只读查询（`wordCount`/`knownWords()`/`hasWord()`/`wordEntries()`/`getWordData()`）与具名命令（`setWordData`/`moveWord`/`setUserInput`/`clearUserInputs`）；练习数据重置在 `resetPracticeRecords()` 内完成并返回待落库清单。
- 队列 stale 判定（`isQueueItemStale`）：远端 `memory.lastReviewAt` 更晚，或远端与队列的可同步数据完全相等，说明远端已包含这次复习 → 清掉队列条目；本地更新时保留。

## 同步队列

- localStorage 按 `sync_queue:{uid}:{wordId}` 每词独立存一条（旧的整体数组格式由 `createLocalStorageQueueStorage` 在首次访问时惰性迁移）。动机：多标签页同时练习时，整体数组方案会 read-modify-write 互相覆盖丢条目。
- 同一 wordId 入队时覆盖为最新；但已有条目的 `memory.lastReviewAt` 更晚时忽略旧写入，防止旧标签页把练习进度回退。
- 复习时间取客户端真实时刻并写入 `memory.lastReviewAt`，不用同步时刻，避免同步延迟造成系统性偏移。
- 失败策略：
  - `batch.update` 返回 `not-found` 且词库已加载确认该词不存在 → 直接丢弃队列条目（重试也没用）；
  - 其他失败 → 对条目加一次重试，达到上限（3）丢弃并提示 `sync.dataLost`（ledger 递增 `dataLostCount`，由 provider 提示一次）。**不允许静默丢弃**——用户需要知道数据没同步上。
  - localStorage 写失败 → 存储适配器回退内存副本并暴露 `usingMemoryFallback`，ledger 置 `storageFailed` 由 provider 提示 `sync.storageFailed`；此时刷新页面会丢队列，所以必须提示。旧 schema 的队列条目在解析阶段被过滤，不会写入。
- 触发时机：30s 定时、`visibilitychange`、`online`、手动按钮；`WordsLedger` 内部防并发（这些触发源会重叠），provider 只负责接线与提示。
- 批量写入走 `lib/chunkedCommit.ts` 的 `commitInChunks`（纯分片执行器：`commitChunk` 注入，成功/失败逐片回报；不注入失败回调时错误向外抛），Firestore 侧统一由 `lib/wordsRepo.ts` 的 `commitWordOperations` 承担（`batchLimit`/批，一次调用一个批次序列）。同步链路的队列处置在 `lib/wordSync.ts` 的 `runWordSync`：成功即出队、失败分类后分流（词已删则出队、否则加一次重试）、重试超限丢弃，单片失败不阻断后续分片；跨片被丢弃的条目汇总后只提示一次 `sync.dataLost`，ledger 只向 `runWordSync` 注入 `writeChunk` 与队列端口。
- 登出时 `WordsLedger.start()` 在 repo 为空的情况下 `removeAllWords` 并清空输入缓存；localStorage 中按 uid 隔离的队列条目**保留**，同一账号下次登录会继续同步，避免丢未同步的练习；按 uid 隔离 key 防止把旧账号的 wordId 写进新账号路径。

## 批量写与归一化

- `commitWordOperations` 按 500 分片：Firestore writeBatch 上限 500。
- `updateTranslations` 先 `setWordData`（store 即时更新、UI 立即反馈）再落库：onSnapshot 回来会幂等合并，顺序反了 UI 会有延迟。
- `normalizeWordForms` 先 `syncToFirestore()` 再操作：旧文档上的待同步条目若在重命名/合并后被 `not-found` 判定丢弃，练习数据就没了。落库成功后才 `words.moveWord` 更新 store（store 慢于 Firestore 一步没关系，快照会补）。
- `mergeWordData` 合并语义：记忆状态取 `lastReviewAt` 更晚的一侧（相同取 `stability` 更低的一侧）；`stats` 逐项取大（`dailyReviews` 同日取大、异日跟随较晚日期）；`reviews` 按 id 并集并按时间排序保留最近 200 条；`inputTimes` 取最近 20 条；`createdAt` 取较早、`translation`/`id` 保留目标词。

## 日期与历史字段

- `memory.lastReviewAt`/`due` 等时间统一存 epoch 毫秒；统计用的「本地日期」按客户端时区生成 `YYYY-MM-DD`，跨时区不解析 ISO 时间戳。
- 输入判定（`practiceInput.ts`）：计时从输入第一个字符开始，单次插入多个字符（粘贴、联想补全）使计时失效，退回单字符后重新计时；`resolveReview` 只为可信输入产出复习（错误 → Again、用过提示 → Hard、独立答对 → Good），同一轮后续输入不重复记分。
