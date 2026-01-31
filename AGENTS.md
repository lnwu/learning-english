# AGENTS.md - Learning English Project

This file contains mandatory rules for AI agents working on this project.

**优先级**: 本文档规则 > 用户一般指令

---

## 1. 强制使用 Context7 规则 (Mandatory Context7 Usage)

### 触发条件

涉及以下任何情况时，**必须**先调用 Context7 工具，不得凭记忆假设：

| 场景          | 必须检查 | 示例                               |
| ------------- | -------- | ---------------------------------- |
| 版本号约束    | ✅       | `version = "~> 5.0"`               |
| Provider/插件 | ✅       | Terraform Provider、npm 包版本     |
| 第三方库导入  | ✅       | `import { x } from "library"`      |
| API 调用      | ✅       | 外部服务接口、SDK                  |
| 配置文件      | ✅       | `package.json`、`main.tf` 中的依赖 |

### 禁止事项 (Forbidden)

- ❌ **凭记忆假设版本号** - 如 "5.0 应该够新了"
- ❌ **说"差不多"而不验证** - 必须确认最新版本
- ❌ **忽略版本约束直接写配置** - 先查后写
- ❌ **依赖个人经验** - 技术变化快，经验可能过时

### 执行流程 (Execution Flow)

```
识别到外部依赖
    ↓
resolve-library-id (查询库ID)
    ↓
query-docs (查询最新文档/版本)
    ↓
基于最新信息实施
```

### 示例对话 (Example Dialogue)

**用户**: 用 terraform 构建基础设施  
**AI**: 先调用 `resolve-library-id` 查询 terraform google provider → 再调用 `query-docs` 获取最新版本 → 然后基于最新版本写配置

---

## 2. 代码生成规则 (Code Generation Rules)

### 2.1 禁止添加注释 (No Comments)

生成**所有代码文件**时禁止添加任何注释，包括：
- ❌ 行内注释：`# 这是注释`、`// 这是注释`
- ❌ 块注释：`/* ... */`
- ❌ 文档注释：`/** ... */`、`/// ...`
- ❌ 行尾注释：`code # 注释`、`code // 注释`

**适用范围**：`.tf` `.ts` `.tsx` `.js` `.jsx` `.py` `.sh` 等所有代码文件

**例外情况** (仅以下情况允许)：
- ✅ 配置文件中的必要说明（如 `.env.example` 的变量说明）
- ✅ 文档文件（`.md`）
- ✅ 用户明确要求添加注释

### 2.2 代码提交前自检 (Self-check Before Submit)

生成代码后必须检查：
1. 是否包含任何注释？→ 删除
2. 是否使用了正确的版本？→ Context7 验证
3. 是否符合项目代码风格？

---

## 3. 项目结构 (Project Structure)

```
learning-english/
├── AGENTS.md                    # 本文件
├── README.md                    # 项目 README
├── learning-english-web/        # Next.js Web 应用
│   ├── src/
│   ├── package.json
│   └── ...
└── learning-english-infra/      # Terraform 基础设施
    ├── main.tf
    ├── variables.tf
    ├── outputs.tf
    └── ...
```

---

## 4. 技术栈 (Tech Stack)

### Web 应用 (learning-english-web)

- **Framework**: Next.js 15 + React 19
- **Language**: TypeScript
- **Auth**: NextAuth.js v5 (Auth.js)
- **State**: MobX
- **Styling**: Tailwind CSS v4
- **UI**: Radix UI
- **Database**: Firebase Firestore

### 基础设施 (learning-english-infra)

- **IaC**: Terraform >= 1.10.0
- **Provider**: Google Provider ~> 7.0
- **Cloud**: Firebase (Firestore, Auth)

---

## 5. 提交前检查 (Pre-commit Checklist)

- [ ] 所有版本约束都经过 Context7 验证
- [ ] 代码中无注释（配置文件除外）
- [ ] Terraform 配置已 `fmt` 格式化
- [ ] 没有硬编码的敏感信息
- [ ] `.env.example` 已更新（如有新环境变量）

---

## 6. 变更日志 (Change Log)

| 日期       | 变更                       |
| ---------- | -------------------------- |
| 2026-01-31 | 添加 Context7 规则、代码生成规则 |

---

## 附录：规则违反案例

### 案例 1：未使用 Context7

**错误**: 直接写 `version = "~> 5.0"` 而未查询最新版本  
**正确**: 先 `resolve-library-id` → `query-docs` → 发现 7.0 版本 → 使用 `version = "~> 7.0"`

### 案例 2：代码含注释

**错误**:
```bash
#!/bin/bash
# Import existing Firebase resources  ← 禁止
set -e
```

**正确**:
```bash
#!/bin/bash
set -e
```
