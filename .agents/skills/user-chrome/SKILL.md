---
name: user-chrome
description: 在 WSL 中通过 CDP 连接用户已打开的 Windows Chrome，并在用户明确授权的范围内执行浏览器操作。
allowed-tools: Bash(agent-browser:*)
---

# 用户已打开的 Chrome

本 skill 只负责本项目与用户 Windows Chrome 的连接约定。一般浏览器命令、快照和交互用法以 `agent-browser` skill 或 CLI 当前版本提供的说明为准；不要把本项目约定写入外部管理的 `.agents/skills/agent-browser` skill。

## 适用范围

- `apps/web` 功能 PR 的 Preview 验收按根 `AGENTS.md` 的交付流程执行；其他场景只有在用户明确要求连接其已打开的浏览器，或明确要求使用现有登录态时，才连接用户 Chrome。
- 默认不启动开发服务器、不打开独立浏览器、不做未授权的页面写操作。

## 连接方式

用户在 Windows 的 `chrome://inspect` 中开启远程调试后，默认 CDP 地址为：

```text
ws://127.0.0.1:9222/devtools/browser
```

该模式只提供 WebSocket 端点，不提供 `/json/*` HTTP 发现接口。访问 `/json/version` 返回 404，或 `agent-browser --auto-connect` 提示找不到实例，都不代表远程调试没有开启。

首次连接时为专用 session 传入 CDP 地址：

```bash
agent-browser --session user-chrome --cdp "ws://127.0.0.1:9222/devtools/browser" open <url>
agent-browser --session user-chrome snapshot -i
```

同一 `user-chrome` session 后续命令通常不需要重复传 `--cdp`。

## 连接注意事项

- Chrome 首次接入时会弹出远程调试批准框；用户未批准时握手可能持续等待且没有明确错误。命令卡住时先提醒用户点击批准，不要反复重连。
- WSL 可以直接访问 Windows 的 `127.0.0.1:9222`，不需要端口转发。
- 如果 9222 已被占用并发生端口回退，从 Chrome 配置目录的 `DevToolsActivePort` 文件第一行读取实际端口，再替换 WebSocket 地址中的端口。

## 安全边界

- 该连接使用用户真实登录态和 cookies。只执行用户明确要求的操作，尤其是提交表单、修改数据、发送消息、删除内容等写操作，必须先获得明确确认。
- 不要因为页面存在按钮就代替用户点击；用户要求验收或探索时，优先使用只读快照和截图。

## 结束连接

用完执行：

```bash
agent-browser --session user-chrome close
```

此命令只断开 `agent-browser` session，不会关闭用户正在使用的 Chrome。
