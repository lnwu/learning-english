# Learning English Infra

本文件包含 AI 在本项目中工作时必须遵守的规则和项目信息。

## 变更流程（改 infra 即上生产）

- push 到 main 且改动命中 `infra/**` 时，`infra-deploy.yml` 会**自动 `terraform apply`，没有人工审批**；PR 阶段由 `infra-plan.yml` 跑 plan 并把结果评论到 PR。合并前必须看 plan 评论确认影响。
- Terraform Cloud remote backend：组织 `lnwu`、workspace `learning-english-infra`（state 不在本地），`TF_API_TOKEN` 为 GitHub secret。
- 本机没有 terraform / firebase CLI，本地不验证；`terraform fmt -check`、`validate` 与 plan 由 CI 兜底。改规则文件（`firestore.rules`）后同样只能靠 plan 评论与 preview 环境验证。

## 项目与资源清单

- GCP 项目 `learning-english-477407`、区域 `asia-east2`（定义在 `main.tf` 的 locals，不要另开区域）。
- 模块在 `modules/firebase/`：GCP 项目与 API 启用、Firebase Web App、Identity Platform（匿名登录开、email/phone 关、Google IdP）、Firestore Native、Firestore 安全规则（`firestore.rules` 经 ruleset 发布）。
- GitHub secrets：`TF_API_TOKEN`、`GCP_WORKLOAD_IDENTITY_PROVIDER`、`GCP_SERVICE_ACCOUNT_EMAIL`、`GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET`、`PROD_USER_UID`（sync-preview-words 用）。
- 授权域名是固定列表（`auth.tf` 的 `base_authorized_domains`，含 `learning-english-web.vercel.app`）；Vercel preview 必须走这个固定 alias 才能登录，Identity Platform 不支持通配域名，换域名或加环境前先改这里。

## Firestore 规则与数据

- 规则（`modules/firebase/firestore.rules`）：`users/{uid}/**` 本人读写；`users/preview/*` 任意登录用户可读、仅匿名用户写（对应根 AGENTS.md 的 preview 设计）；末尾 catch-all 显式拒绝。改动规则会影响线上所有写入，与 `apps/web` 的写入字段必须成对修改。
- 规则含**字段校验**（类型/长度上限，防超大与脏文档）：words 文档字段以 `apps/web` 的写入为准——`useWordActions.ts`（addDoc、reset、合并）、`useWordsSync.ts`/`wordSync.ts`（同步载荷）、practiceTime 文档为 `{ seconds }`。新增写入字段或改字段类型时**必须同步更新 `firestore.rules` 的校验函数，否则写入会被拒绝**。
- 规则全部是 `request.auth` 的 O(1) 检查，禁止引入 `get()`/`exists()`（规则求值读取会产生额外计费）；校验函数只看 `request.resource.data`。
- `firestore.indexes.json` 目前是空对象：客户端没有任何 `where`/`orderBy` 查询，单字段自动索引足够；**将来添加带条件的查询前必须先在这里补复合索引并接入发布流程**。
- `firestore.tf`：`DELETE_PROTECTION_ENABLED` + `prevent_destroy`，不要为了任何操作方便把它关掉；PITR 保持关闭（成本取舍），因此**删除生产数据不可恢复**，操作 `users/*` 数据要先确认路径。
- `auth.tf` 开启 `autodelete_anonymous_users`：匿名账号仅用于 preview 登录，`users/preview/*` 数据由 sync 脚本每 6 小时从生产覆盖，自动清理无风险，不要改回 `false`。
