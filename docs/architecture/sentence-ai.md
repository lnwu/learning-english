# 造句练习与 AI 集成设计

本文记录造句/翻译链路的**设计动机**；必须遵守的规则在 `apps/web/AGENTS.md`。实现：`src/app/api/*`（Route Handler）、`src/lib/{apiRoute,apiInput,aiClient,aiProviders,serverAuth,rateLimit,translationCache,sentenceCompare,wordSenses,lemma,wordLookup,wordSourceSearch,wordSources,sentenceMessages}.ts`、`src/hooks/{useSentencePractice,useDefinitionFlow}.ts`。

## 架构

- 浏览器只请求本站 `/api/*`，服务端代理调用各模型服务商。原因：API Key 只能留在服务端；同时便于在服务端加鉴权、限流、缓存三道闸。
- `postJson<T>`（`lib/apiClient.ts`）统一负责取 ID token、注入当前选择的模型与错误解析，避免每个调用点手写 token + fetch。
- 路由骨架统一走 `withApiPost`（`lib/apiRoute.ts`）：`serverAuth` → JSON 解析与输入校验 → `checkRateLimit` → `handle` → AI 错误映射与兜底文案；解析排在限流前，因为限额可以按请求体选择（`refresh` 走独立桶）。输入形状与上限由 `lib/apiInput.ts` 的 `parseBody` + 字段解析器声明式描述（超长/缺失/非法统一生成 400 文案），各路由只提供声明式 `parse`（输入校验）与 `handle`（调模型、返回响应），限额集中在 `API_RATE_LIMITS`（默认窗口 60s）。

## 鉴权与限流

- `serverAuth.ts` 经 Identity Toolkit REST 校验 ID token，结果进程内缓存（上限 1000、淘汰最旧）：不缓存则每个请求都要打一次 Google，延迟与配额都不可接受；有上限是防止长驻实例内存无界增长。
- 按 uid 限流（`rateLimit.ts`）：配置 Upstash（Vercel Marketplace 自动注入 `KV_REST_*`/`UPSTASH_REDIS_REST_*`）时用 Redis 做**跨实例**全局限流——Vercel serverless 多实例，进程内计数各限各的没意义；本地没配时回退进程内固定窗口。**Redis 故障时会静默降级为每实例限流**（仅打 console.error），此时全局限额实际失效但对外行为不变，属于有意取舍。

## AI Provider 封装

- 模型清单是代码里的注册表（`lib/aiProviders.ts`）：每个模型一条 `provider/model` 复合 ID，含服务商、得名、SDK 类型、baseUrl 与 API Key 环境变量名。**baseUrl 与模型清单写在代码里**，环境变量只提供 API Key（`DEEPSEEK_API_KEY`/`OPENCODE_API_KEY`/`MIMO_API_KEY`）：端点与模型 ID 属于代码常量，改它们应当走代码评审，而 API Key 只存在于部署环境。未配置 Key 的服务商不在可选列表中，请求它得到 500。
- 三个服务商都是 OpenAI / Anthropic / Google 协议中的一个，因此用 Vercel AI SDK 统一调用：`@ai-sdk/openai-compatible`（DeepSeek、MiMo 的 chat/completions）、`@ai-sdk/anthropic`（OpenCode Zen 的 Claude）、`@ai-sdk/google`（OpenCode Zen 的 Gemini）。上层只看到 `generateText`，路由不知道底层协议差异。
- `chatCompletionJson`（`lib/aiClient.ts`）：按模型 ID 解析 provider、读 Key、缓存 provider 实例；网络错误与 429/5xx 自动重试一次；**504 不重试**（超时本身已耗掉预算，重试让总时长翻倍且大概率再超时）；SDK 自己的重试关闭（`maxRetries: 0`），重试语义只由这一层决定。非 JSON 响应与 AI 服务错误统一归类 `AiServiceError(502)`，超时 504，未配置 Key 500，未知模型 400。单次请求超时由调用方用 `timeoutMs` 指定（缺省 30s），translate 因为要先抓来源候选而用 60s。**超时预算要与该路由的工作量对齐**：`maxOutputTokens` 是上限而不是承诺，推理型模型的思考 token 也占这个上限，因此同时产出义项与来源的 translate 用 8192（否则推理 token 占满后会返回空内容）；超时值还要留在 Vercel 函数上限（Hobby + Fluid compute 为 300s）以内。
- 思考档位写在注册表里：DeepSeek、Gemini 3.8 Flash、Claude 5.5 传各自最低档 `reasoning: "low"`；MiMo 的 chat/completions 只有开关、没有分档，不传该参数（默认开启即它的最低）。词典任务不需要深推理，但完全关闭会降低义项质量。
- 不支持的采样参数由注册表 `supportsTemperature` 标注：Claude 5.5 不支持 `temperature`，MiMo 在思考模式下会忽略 `temperature`，两者都不传该参数。
- JSON 输出的鲁棒性由 `extractJson` 统一兜住：OpenAI 系的 `response_format: json_object` 在 Anthropic/Google 协议没有对应参数，因此不依赖该参数，而是从返回值里取 markdown fence 或首尾大括号之间的对象再解析；prompt 里「只返回 JSON」的约定保持不变。
- `ChatMessage[]` 里的 system 消息在调用前抽成 SDK 的顶层 `instructions`：AI SDK 默认不接受 `messages` 数组里的 system 消息（会报 `AI_InvalidPromptError`），而各路由的 prompt 都是 system + user 形态。

## 翻译与释义

- `/api/translate` 是单词翻译的唯一入口，一次调用返回 `lemma`（词典原形）、结构化 `senses` 与 `sources`（来源摘录）。`senses` 最多 3 条，只列学习者日常会遇到的常用义项，按使用频率从高到低，最常用在前；`sources` 的每个义项、每种来源至多一条。请求体带 `refresh: true` 表示重新生成：跳过缓存读、写完仍回填缓存，并走独立的限流桶。
- 释义的 prompt 用英文写给模型（面向模型的指令统一用英文，中文只作为 `chinese` 字段的值），含义项选择的约束在 `lib/aiPrompts.ts` 的 `SENSE_SELECTION_RULE`。来源配对在同一次调用里完成：prompt 只给编号候选，模型只从候选中挑选并标注所在义项，不改写摘录；候选缺失或不适配时返回空数组。不使用 Google Translate/Datamuse 等免费源作回退：质量与可用性不稳定。模型判定非有效单词（`isWord` 非布尔 `true`）时 `senses: null`（前端提示、不落库）；调用失败返回错误且前端不落库。
- 义项校验统一 `sanitizeWordSenses`（`lib/wordSenses.ts`），来源清洗统一 `sanitizeWordSources`（`lib/wordSources.ts`），防止模型输出超长或多义项越界的字段撑大文档。`WordSense`/`WordSource` 类型、`translation` 字符串的编解码（`encodeSenses`/`decodeSenses`）与造句只需中文译法的 `chineseTranslations` 都在 `lib/wordSenses.ts`；写路径由 `lib/wordDoc.ts` 的 `translationFields`/`definitionFields` 统一编码，调用方与组件只传结构化义项与来源。
- `translation` 的持久化形态是「词性 英文 — 中文」逐行（英文在前）；`decodeSenses` 按字段里是否含中日韩字符判定哪一侧是中文，因此旧的「中文在前」数据不需要迁移也能正确展示。
- translate 的 prompt 与解析在 `lib/wordLookup.ts`：`buildWordLookupMessages` 接收候选来源列表，`parseWordLookupResult` 负责 lemma 清洗、义项清洗、来源越界与同义项同来源去重、非单词判定，`isWord` 为真但义项全非法时抛 502；路由只做取参与缓存读写。
- 来源候选由 `lib/wordSourceSearch.ts` 从 Wikipedia、Stack Exchange（english.stackexchange）与 Urban Dictionary 三个免 Key 的公开接口收集：摘取含目标词的完整句子，每来源最多两条，三源并行、单个失败只记日志。
- 翻译缓存（`translationCache.ts`）：L1 进程内 LRU + L2 Redis（30 天），key 前缀带版本号（见该文件的 `CACHE_KEY_PREFIX`，不在文档里复述具体版本），只存 `senses` 非空的成功结果。默认模型（`deepseek/deepseek-flash`）用无模型后缀的 key，其他模型在 key 里带上模型 ID，避免不同模型互相污染。**改 translate 的 prompt 或默认模型必须 bump 前缀**，否则旧释义会在缓存里长期复用。
- `/api/translate/compare` 一次请求并行取多个模型的释义（上限为注册表里的模型总数，不会超过一排可选模型），供添加单词与 Profile 释义弹窗并排对比：候选来源只抓一次并复用给所有模型，逐模型返回 `{ model, lemma, senses, sources }` 或错误（单个模型失败不影响其他模型），所以选定某个模型后它的来源也一并就位。它是挑选动作，**不读写翻译缓存**。

## 造句交互设计（有意为之，别改）

- **题面不显示目标词**：学生凭中文句子推断用词。因此生成请求会把词库存的中文译法随目标词一并传给模型，prompt 要求中文译文自然、使用参考译法、且能让学生反推出目标词；批改时同义表达不判错、仅提示。
- **每题一考**：同一道题首次提交后可以「重新批改」，但批改只更新反馈，不写任何持久化数据。
- 页面提交后**不锁定答案**：输入框保持可编辑，首次批改后显示「重新批改」；重新批改只更新反馈。首次批改满分自动下一题，重新批改满分停留本题（让用户看反馈）。
- 造句练习不写入熟练度数据：不产生记忆状态、复习日志与计时样本（见 `docs/WORD_FAMILIARITY_ALGORITHM.md`）。
- 提交前先 `normalizeForComparison`（`lib/sentenceCompare.ts`）规范化判等：与参考译文完全一致时用 `isExactMatchAnswer` + `buildExactMatchResult` 直接构造满分结果，**省一次模型调用**；快路径与模型批改路径产出同一份 `CheckResult`。
- 生成与批改的 prompt、消息构造与响应解析在 `lib/sentenceMessages.ts`：`parseGenerateResult` 要求 `chinese`/`english` 非空，且模型所选目标词是候选词子集（大小写不敏感、去重、上限 `MAX_SENTENCE_WORDS`）、数量不少于 `MIN_SENTENCE_WORDS`，否则判失败；`parseCheckResult` 对 `score` 做 0-100 夹取取整、截断超长 `feedback`/`corrected`、过滤非字符串 `issues`（防御模型异常输出），但**不改** `correct` 的判定语义。
- 题目生成的抽词：从词库中均匀随机抽取至多 `SENTENCE_WORD_POOL_SIZE`（6）个候选词，由模型从中挑选 2-3 个能自然共现的词作为本题目标词并随响应返回（`lib/sentenceWords.ts`，纯函数可测）；单词不足时 hook 置 `insufficientWords` 状态。
- 句子质量约束：模型从候选池选词而不是强行使用全部随机词，是为了避免语义跨度大的词被硬凑进一句话、编出不符合常识的情节；prompt 要求先设想真实生活场景、禁止牵强的因果与对比、宁可平实也不硬凑，并在同等自然的前提下优先选择更值得练习的词（抽象名词、动词、形容词、固定搭配优先于具体名词），以缓解池选词对抽象词的覆盖损失。

## 重新生成释义

- 添加单词与重新生成释义走同一套客户端逻辑（`hooks/useDefinitionFlow.ts`）：先用当前生效模型调 `/api/translate`（重新生成带 `refresh: true`），拿到义项与来源后立即落库（`updateTranslations` 同一次写 `translation` 与 `sources`），再提供多模型对比。对比选定后写入该模型的义项与它自己配对的来源——客户端的任何写入路径都同时带 `sources`，没有“只写义项”的分支。
- 单个单词的重新生成在 Profile 释义弹窗（`app/profile/WordDefinitionDialog.tsx`）里做：刷新写库后可再展开对比并覆盖。单词 key 不变，返回的 `lemma` 不参与落库。
- 批量重新生成逐词串行调同一端点、显示进度；`senses: null` 的词保留原释义与来源，失败的词按跳过计数并在提示里体现。只改 `translation` 与 `sources`，不碰练习数据。

## 模型选择

- 用户选择的模型存在 Firestore `users/{uid}` 文档的 `aiModel` 字段（`lib/aiModelPreference.ts`），登录后加载、改完立即写回，登出回到默认值。不改用 localStorage：模型选择应当跟账号走，且 `users/{uid}` 根文档的读写已在现有安全规则内。
- 服务端在根 layout 里把**已启用**的模型清单（Key 已配置的那些）传给客户端 Provider（`hooks/useAiModel.tsx`），Profile 页用它渲染选择器、添加单词弹窗用它渲染对比选项；不在客户端重复判定 Key 是否存在。
- `postJson` 把当前模型注入每个请求体的 `model` 字段，各路由用 `optionalAiModelId()` 解析：翻译、重新生成、造句生成与批改全部跟随同一个设置，缺省（字段为空或未传）等价于默认模型。

## 测试边界

纯函数（消息构造、解析、判等、清洗、重试语义、模型路由、限流窗口）都有 `*.test.ts`；改动这些逻辑时同步补测试，路由层保持薄。
