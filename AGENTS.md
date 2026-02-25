# AGENTS.md - Learning English 项目

本文件包含 AI 代理在本项目中工作时必须遵守的规则和项目信息。

### 模块 AGENTS 加载决策

| 任务类型              | 需要读取的 AGENTS.md                                                  |
| --------------------- | --------------------------------------------------------------------- |
| 仅修改 Web            | `learning-english-web/AGENTS.md`                                      |
| 仅修改 Infra          | `learning-english-infra/AGENTS.md`                                    |
| 同时涉及 Web 与 Infra | `learning-english-web/AGENTS.md` + `learning-english-infra/AGENTS.md` |

---

## 全局强制规则

以下规则适用于整个项目：

### 0. 规则优先级（强制）

规则冲突时按以下优先级执行（从高到低）：

1. 用户在当前对话中的明确要求
2. 模块级 AGENTS.md（`learning-english-web/AGENTS.md` 或 `learning-english-infra/AGENTS.md`）
3. 根目录全局 AGENTS.md（本文件）

### 1. 通用规则

- 回复我时使用中文。
- 写文档时使用中文。
- 生成代码时不用生成注释。
- 每次更新代码后检查 AGENTS.md 是否需要更新。