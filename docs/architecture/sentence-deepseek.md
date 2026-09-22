# 造句练习与 DeepSeek 集成设计

本文记录造句/翻译链路的**设计动机**；必须遵守的规则在 `apps/web/AGENTS.md`。实现：`src/app/api/*`（Route Handler）、`src/lib/{deepseek,serverAuth,rateLimit,translationCache,sentenceCompare,senses,lemma,parseTranslation}.ts`、`src/hooks/useSentencePractice.ts`。

## 架构

- 浏览器只请求本站 `/api/*`，服务端代理调用 DeepSeek。原因：API Key 只能留在服务端；同时便于在服务端加鉴权、限流、缓存三道闸。
- `postJson<T>`（`lib/apiClient.ts`）统一负责取 ID token 与错误解析，避免每个调用点手写 token + fetch。

## 鉴权与限流

- `serverAuth.ts` 经 Identity Toolkit REST 校验 ID token，结果进程内缓存（上限 1000、淘汰最旧）：不缓存则每个请求都要打一次 Google，延迟与配额都不可接受；有上限是防止长驻实例内存无界增长。
- 按 uid 限流（`rateLimit.ts`）：配置 Upstash（Vercel Marketplace 自动注入 `KV_REST_*`/`UPSTASH_REDIS_REST_*`）时用 Redis 做**跨实例**全局限流——Vercel serverless 多实例，进程内计数各限各的没意义；本地没配时回退进程内固定窗口。

## DeepSeek 封装

- `chatCompletionJson`：网络错误与 429/5xx 自动重试一次；**504 不重试**（超时本身已耗掉预算，重试让总时长翻倍且大概率再超时）；非 JSON 响应统一归类 `DeepSeekError(502)`。
- 环境变量 `DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL`/`DEEPSEEK_MODEL`，只在服务端读取。

## 翻译与释义

- `/api/translate` 一次调用同时返回 `lemma`（词典原形）与结构化 `senses`（2~4 个义项，最常用在前）。不再回退 Google Translate/Datamuse 等免费源：质量与可用性不稳定，`lib/dictionary.ts` 已删除，不要复活回退词典。模型判定非有效单词时 `senses: null`（前端提示、不落库）；调用失败返回错误且前端不落库。
- 义项校验统一 `sanitizeWordSenses`（`lib/senses.ts`），`/api/translate` 与 `regenerate-definitions` 共用，防止模型输出超长字段撑大文档（也是 rules 字段上限的第一道闸）。
- 翻译缓存（`translationCache.ts`）：L1 进程内 LRU + L2 Redis（30 天，key 前缀 `translation:v2`），只存 `senses` 非空的成功结果。**改 translate 的 prompt 或默认模型必须 bump 前缀**，否则旧释义会在缓存里长期复用。
- 前端 `formatSenses` 把 `senses` 拼成「词性+中文 — 英文」逐行存入 `translation`；`parseTranslation` 兼容旧格式（首行英文、其余中文），旧数据无需迁移。

## 造句交互设计（有意为之，别改）

- **题面不显示目标词**：学生凭中文句子推断用词。因此生成请求会把词库存的中文译法随目标词一并传给模型，prompt 要求中文译文自然、使用参考译法、且能让学生反推出目标词；批改时同义表达不判错、仅提示。
- **每题一考**：`scoredQuestionRef` 只允许同一道题首次提交计分，防止重复提交刷熟练度。
- 页面提交后**不锁定答案**：输入框保持可编辑，首次批改后显示「重新批改」；重新批改只更新反馈、不改变计分。首次批改满分自动下一题，重新批改满分停留本题（让用户看反馈）。
- `usedWords` 计分：批改接口只返回用户实际用到的目标词（同义替代也算），未用到的不记分；模型没返回该字段时回退全部目标词。
- 造句**不传 `inputTimeSeconds`**：没有真实输入计时，伪造会抬高 speedScore；`calculateMasteryScore` 对无计时词让速度/稳定性因子不参与加权（见 `docs/WORD_FAMILIARITY_ALGORITHM.md`）。
- 提交前先 `normalizeForComparison` 规范化判等：与参考译文完全一致直接满分，**省一次模型调用**；`resolveUsedWords`/`sanitizeUsedWords` 同文件可测，不在路由内联重复实现。
- 题目生成的抽词优先级：练习次数 ≥3 的词优先、少练的作补位（`PRIORITIALIZED_MIN_ATTEMPTS`），避免老词永远不出、新词过拟合。

## 批量重新生成释义

- `/api/regenerate-definitions`：每批 ≤50、服务端过滤非小写字母/超长词并去重；一次调用返回逐词 `senses`，`null` 表示未识别（前端保留原释义）。前端串行分批并显示进度，通过 `updateTranslations` 落库——只改 `translation`，不碰练习数据。

## 测试边界

纯函数（消息构造、解析、判等、清洗、重试语义、限流窗口）都有 `*.test.ts`；改动这些逻辑时同步补测试，路由层保持薄。
