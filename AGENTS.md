# AGENTS.md - Learning English Project

This file contains mandatory rules and project information for AI agents working on this project.

## Module-Specific Rules

本项目采用模块化 AGENTS.md 结构，各模块详细规则请查看对应文件：

| Module          | Path                                                                   | Description                      |
| --------------- | ---------------------------------------------------------------------- | -------------------------------- |
| Infrastructure  | [`learning-english-infra/AGENTS.md`](learning-english-infra/AGENTS.md) | Terraform, GCP, Firebase rules   |
| Web Application | [`learning-english-web/AGENTS.md`](learning-english-web/AGENTS.md)     | Next.js, React, TypeScript rules |

**按需加载原则**：当处理特定模块时，应首先读取对应模块的 AGENTS.md 获取完整上下文。

---

## Global Mandatory Rules

以下规则适用于整个项目：

### 1. Context7 Usage (Mandatory)

涉及以下任何情况时，**必须**先调用 Context7 工具，不得凭记忆假设：

| 场景          | 必须检查 | 示例                               |
| ------------- | -------- | ---------------------------------- |
| 版本号约束    | ✅       | `version = "~> 5.0"`               |
| Provider/插件 | ✅       | Terraform Provider、npm 包版本     |
| 第三方库导入  | ✅       | `import { x } from "library"`      |
| API 调用      | ✅       | 外部服务接口、SDK                  |
| 配置文件      | ✅       | `package.json`、`main.tf` 中的依赖 |

### 2. Code Generation Rules

生成**所有代码文件**时禁止添加任何注释，包括：

- ❌ 行内注释：`# 这是注释`、`// 这是注释`
- ❌ 块注释：`/* ... */`
- ❌ 文档注释：`/** ... */`、`/// ...`
- ❌ 行尾注释：`code # 注释`、`code // 注释`

**适用范围**：`.tf` `.ts` `.tsx` `.js` `.jsx` `.py` `.sh` 等所有代码文件

**例外情况**：用户明确要求添加注释时 ✅

### 3. Agent Skill 安装规范

#### 3.1 安装前确认

当用户要求安装 Agent Skill 时，**必须**先询问确认：

> "你需要将 skill 安装到项目级别 (project level) 还是全局 (global)？"

- **Project level**: 仅当前项目可用，安装到 `{project}/.agents/skills/`
- **Global**: 用户级别可用，安装到 `~/.agents/skills/`

#### 3.2 安装目录限制

**只允许**安装到以下目录：

```
# Project level
{project}/.agents/skills/{skill-name}/SKILL.md

# Global
~/.agents/skills/{skill-name}/SKILL.md
```

#### 3.3 安装命令

```bash
# Project level (推荐)
cd {project}
npx skills add <owner/repo@skill> -y

# Global
npx skills add <owner/repo@skill> -g -y
```

#### 3.4 禁止事项

- ❌ 不要创建其他 agent 的符号链接目录（如 `.cline/`, `.cursor/` 等）
- ❌ 不要安装到 `.skills/` 或其他非标准目录
- ❌ 未经确认不要自动安装 skill

#### 3.5 清理其他 Agent 目录

如果误装了其他 agent 的目录，执行清理：

```bash
cd {project}
rm -rf .augment .kode .agent .mux .factory .codex .gemini .mcpjam \
       .openclaude .claude .cline .codebuddy .commandcode .continue \
       .crush .cursor .adal .github .goose .iflow .junie .kilocode \
       .kiro .neovate .opencode .openhands .pi .pochi .qoder .qwen \
       .roo .trae .traecn .vibe .windsurf .zencoder skills
```

只保留 `.agents/` 目录供 Kimi Code 使用。

---

## Project Overview

Learning English is a personal monorepo for an English vocabulary learning application.

### Repository Structure

```
learning-english/
├── learning-english-web/     # Next.js web application
│   └── AGENTS.md             # Web module rules
├── learning-english-infra/   # Terraform infrastructure
│   └── AGENTS.md             # Infra module rules
├── AGENTS.md                 # This file (global rules)
└── README.md                 # Project overview
```

### High-Level Architecture

```
┌─────────────────────┐
│   learning-english  │
├─────────┬───────────┤
│  Web    │  Infra    │
│  (UI)   │  (IaC)    │
├─────────┼───────────┤
│ Next.js │ Terraform │
│ Firestore│ GCP      │
└─────────┴───────────┘
```

### Quick Links

| Resource      | Location                           |
| ------------- | ---------------------------------- |
| Web docs      | `learning-english-web/docs/`       |
| Infra modules | `learning-english-infra/modules/`  |
| Web README    | `learning-english-web/README.md`   |
| Infra README  | `learning-english-infra/README.md` |

## License

MIT License - See LICENSE file for details
