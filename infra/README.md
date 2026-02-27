# Learning English Infrastructure

Terraform 配置，用于为 Learning English 应用管理基础设施。

## Remote State（Terraform Cloud）

本目录已切换为 Terraform Cloud `remote backend`。

### 一次性准备

```bash
terraform login
```

在 Terraform Cloud 上创建 organization，并创建 workspace：`learning-english-infra`。

### 初始化并迁移 state

```bash
terraform init -migrate-state
```

### 后续使用

后续在同一目录运行 `terraform plan/apply` 即可继续使用远端 state。

### 必改项

请先把 `main.tf` 中 `backend "remote"` 的 `organization` 改成你的 Terraform Cloud organization 名称。
