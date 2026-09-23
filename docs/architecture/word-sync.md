# 词库同步与状态管理设计

本文记录 words 数据流的**设计动机与背景**；必须遵守的行为规则在 `apps/web/AGENTS.md`。实现分布：`src/hooks/useWordsSync.ts`（订阅/同步/记分入队）、`src/hooks/useWordActions.ts`（增删改/归一化/重置）、`src/hooks/useFirestoreWords.tsx`（context 组合层，按 effective uid 构造 repo）、`src/lib/{wordsStore,wordSync,syncQueue,wordNormalization,chunkedCommit}.ts`（纯逻辑，均有测试）、`src/lib/wordsRepo.ts`（唯一接触 Firestore SDK 的模块）、`src/lib/firebase.ts`（惰性 app/db/auth）。

## 数据模型

- `users/{uid}/words/{docId}`：字段 `word`/`translation`/`correctCount`/`totalAttempts`/`inputTimes`/`lastPracticedAt`/`correctPracticeDates`/`attemptHistory`/`createdAt`。文档 id 是 addDoc 自动 id，不是单词本身（归一化重命名时要保留 id 就是为此）。
- `users/{uid}/practiceTime/{YYYY-MM-DD}`：`{ seconds }`，每天一个文档。
- preview 环境读写 `users/preview/*`，设计见根 AGENTS.md；规则的字段校验清单见 `infra/AGENTS.md`。
- 客户端所有 Firestore 读写都经 `lib/wordsRepo.ts`：repo 在构造时捕获 effective uid（preview 环境映射为 `preview`），调用方无法传错 uid；订阅、批量写与 practiceTime 递增都收在这一处，hooks 与页面不再 import `firebase/firestore`。
- 文档字段的投影与解析集中在 `lib/wordDoc.ts`：新词文档（`newWordDocFields`）、队列/同步载荷（`practiceFields`）、落库更新（`attemptUpdateFields`）、重置（`resetPracticeFields`）与解析兜底（`parseWordDoc`）都从这里取；新增同步字段时改 `WordData`、`SyncableWordData` 与这个文件即可，不要在调用方内联字段清单。

## 订阅与快照合并

- `WordsProvider` 登录后只做一次 `onSnapshot`（全集合）：多处订阅会对同一集合重复收快照、重复触发合并。
- `mergeSnapshotIntoStore` **增量**合并：只更新有变化的词、只对变化词失效 `#masteryCache`。全量替换会让所有 observer 组件无谓重渲染（WordRow 一行一组件，词库几百条时明显）。
- 快照合并会叠加本地同步队列的 pending 数据，动机是**防止未同步的练习被旧快照回退**：远端在 `totalAttempts`/`correctCount` 两个维度都不低于本地且至少一个更高（支配本地）时才用远端，否则用本地覆盖。返回值里的 `byId` 是不叠加队列的远端原始数据，供队列 stale 判定使用——两个视图不要合并：stale 判定统一走 `collectStaleQueueItemIds(merged, queue)`，由函数内部取 `byId`，调用方无法传错视图。
- `Words` 的 `wordData`/`userInputs` 是私有字段（TS `private`，不能是 `#`，否则 MobX 观测不到），对外只暴露只读查询（`wordCount`/`knownWords()`/`hasWord()`/`wordEntries()`/`getWordData()`）与具名命令（`setWordData`/`moveWord`/`setUserInput`/`clearUserInputs`）；练习数据重置在 `resetPracticeRecords()` 内完成并返回待落库清单，缓存失效不再由调用方负责。
- 队列 stale 判定（`isQueueItemStale`）：远端支配本地、或可同步字段完全相等，说明远端已包含这次练习 → 清掉队列条目；计数打平但数组不同**保留本地**，否则会丢练习日期/对错序列。

## 同步队列

- localStorage 按 `sync_queue:{uid}:{wordId}` 每词独立存一条（旧的整体数组格式在 `setUser` 时自动迁移）。动机：多标签页同时练习时，整体数组方案会 read-modify-write 互相覆盖丢条目。
- `addToQueue` 对同一 wordId 覆盖为最新；但已有条目的 `retryCount` 更高时忽略低计数写入，防止旧标签页把进度回退。
- `lastPracticedAt` 取队列条目的 `timestamp`（真实练习时刻）：同步最快也要等 30s 触发，用同步时刻会系统性偏移最近练习时间。
- 失败策略：
  - `batch.update` 返回 `not-found` 且词库已加载确认该词不存在 → 直接丢弃队列条目（重试也没用）；
  - 其他失败 → `incrementRetries`，达到上限丢弃并 toast `sync.dataLost`。**不允许静默丢弃**——用户需要知道数据没同步上。
  - localStorage 写失败 → 队列回退内存副本并 toast `sync.storageFailed`，此时刷新页面会丢队列，所以必须提示。
- 触发时机：30s 定时、`visibilitychange`、`online`、手动按钮；`syncingRef` 防并发（这些触发源会重叠）。
- 批量写入走 `lib/chunkedCommit.ts` 的 `commitInChunks`（纯分片执行器：`commitChunk` 注入，成功/失败逐片回报；不注入失败回调时错误向外抛），Firestore 侧统一由 `lib/wordsRepo.ts` 的 `commitWordOperations` 承担（500/批，一次调用一个批次序列）。同步链路的队列处置在 `lib/wordSync.ts` 的 `runWordSync`：成功即出队、失败分类后分流（词已删则出队、否则加一次重试）、重试超限丢弃，单片失败不阻断后续分片；跨片被丢弃的条目汇总后只提示一次 `sync.dataLost`，hook 只注入 `writeChunk` 与队列端口。
- 登出清空 store 与队列、按 uid 隔离 key：防止把旧账号的 wordId 写进新账号路径。

## 批量写与归一化

- `commitWordOperations` 按 500 分片：Firestore writeBatch 上限 500。
- `updateTranslations` 先 `setWordData`（store 即时更新、UI 立即反馈）再落库：onSnapshot 回来会幂等合并，顺序反了 UI 会有延迟。
- `normalizeWordForms` 先 `syncToFirestore()` 再操作：旧文档上的待同步条目若在重命名/合并后被 `not-found` 判定丢弃，练习数据就没了。落库成功后才 `words.moveWord` 更新 store（store 慢于 Firestore 一步没关系，快照会补）。
- `mergeWordData` 合并语义：计数相加、`inputTimes`/`attemptHistory` 取最近 20/30、`correctPracticeDates` 去重排序取最近 30、`lastPracticedAt` 取较晚、`createdAt` 取较早、`translation`/`id` 保留目标词。调整上限时同步 `Words.MAX_*` 与 rules 校验上限。

## 日期与历史字段

- `correctPracticeDates` 存 `YYYY-MM-DD` **本地日期**字符串：ISO 时间戳跨时区解析会偏移一天（`getLocalPracticeDate` 对纯日期字符串短路）。
- `attemptHistory` 只存最近 30 条对错序列，正确率统计在缺失时回退全量计数（老数据没有该字段）。
- 输入判定（`practiceInput.ts`）：一轮内首字符开始计时；完全一致即 completed，之后多打/清空不再记对错；正确只在首次达成且有计时时记一次（防答对后清空重打刷分）；错误按「删到长度不足后可再记」去重。
