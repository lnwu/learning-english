# AGENTS.md - Learning English Infra

本文件包含 AI 代理在 `learning-english-infra` 模块中工作时必须遵守的规则。

---

## 项目概述

使用 Terraform 管理 Learning English 应用的 GCP / Firebase 基础设施。

- **IaC 工具**：Terraform >= 1.10.0
- **云平台**：Google Cloud Platform（项目 ID `learning-english-477407`，区域 `asia-east2`）
- **Provider**：`hashicorp/google` 和 `hashicorp/google-beta` ~> 7.0
- **核心资源**：Firebase 项目、Firebase Web App、Firestore 数据库（FIRESTORE_NATIVE）、Firestore 安全规则

## 目录结构

```
learning-english-infra/
├── main.tf                        # 根模块：provider、locals、模块调用
├── terraform.tfstate              # 状态文件（勿手动修改）
└── modules/
    └── firebase/
        ├── main.tf                # GCP 项目、Firebase 项目及 Web App
        ├── firestore.tf           # Firestore 数据库
        ├── rules.tf               # Firestore 安全规则发布
        ├── firestore.rules        # Firestore 安全规则源文件
        ├── variables.tf           # 模块输入变量
        └── outputs.tf             # 模块输出
```

## 强制规则

### 1. Terraform 规范

- 所有资源使用 HCL 编写，不得使用 JSON 格式。
- 新增资源必须放在 `modules/firebase/` 下对应的 `.tf` 文件中；如需新模块需在根 `main.tf` 中调用。
- 变量必须包含 `description` 和 `type`，可选提供 `default`。
- 输出必须包含 `description`。
- 资源之间的依赖关系通过 `depends_on` 显式声明。
- 需要 `google-beta` provider 的资源必须显式指定 `provider = google-beta`。

### 2. 状态文件

- **禁止**手动编辑 `terraform.tfstate` 及其备份文件。
- 不得在代码中硬编码敏感信息（密钥、token 等）。

### 3. Firestore 安全规则

- 安全规则源文件为 `modules/firebase/firestore.rules`。
- 修改规则时必须同时确认 `rules.tf` 中的发布资源配置保持正确。
- 规则变更必须保持最小权限原则：仅允许已认证用户访问 `/users/{userId}` 和 `/users/{userId}/words/{wordId}`，其余路径全部拒绝。

### 4. 命名约定

- 资源名称使用下划线分隔（snake_case）。
- 独立唯一的资源使用 `this` 作为资源名（例如 `google_project.this`）。

### 5. 变更验证

- 修改 `.tf` 文件后需确认 `terraform validate` 通过。
- 修改 `firestore.rules` 后检查语法正确性。

## 常用命令

```bash
terraform init       # 初始化
terraform validate   # 验证配置
terraform plan       # 查看变更计划
terraform apply      # 应用变更
terraform fmt        # 格式化代码
```
