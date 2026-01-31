# AGENTS.md - Learning English Project

This file contains mandatory rules for AI agents working on this project.

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

## 2. 代码生成规则 (Code Generation Rules)

### 2.1 禁止添加注释 (No Comments)

生成**所有代码文件**时禁止添加任何注释，包括：

- ❌ 行内注释：`# 这是注释`、`// 这是注释`
- ❌ 块注释：`/* ... */`
- ❌ 文档注释：`/** ... */`、`/// ...`
- ❌ 行尾注释：`code # 注释`、`code // 注释`

**适用范围**：`.tf` `.ts` `.tsx` `.js` `.jsx` `.py` `.sh` 等所有代码文件

**例外情况** (仅以下情况允许)：

- ✅ 用户明确要求添加注释
