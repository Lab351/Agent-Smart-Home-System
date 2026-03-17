---
name: a2a-sdk-dev-guide
description: "Use when: implementing or refactoring agent-to-agent features with a2a-sdk in this repo, including protocol contract design, message model validation, transport wiring, error handling, and integration tests across central-agent, room-agent, and personal-agent. Do not use for non-a2a business logic, UI changes, or unrelated infra tasks."
---

# A2A SDK Development Guide

## Purpose

Provide a repeatable development workflow for implementing and refactoring A2A features with `a2a-sdk` in this repository.
The guide focuses on protocol contract design, model validation, transport wiring, error handling, and integration tests across `central-agent`, `room-agent`, and `personal-agent`.

## Instructions

`a2a-sdk` 仍在快速演进，避免依赖过时的内部记忆。开始实现前，先阅读官方文档与示例，再进入代码修改。

### 1) Pre-check

1. 先确认当前任务是否属于 A2A 范围：协议、消息模型、Agent 间通信、错误处理或联调测试。
2. 若任务是 UI、非 A2A 业务逻辑、或与基础设施无关改动，退出本 skill。

### 2) Source of truth

优先参考以下来源，并在实现时以其为准：

[项目 Readme](https://github.com/a2aproject/a2a-python/raw/refs/heads/main/README.md)

[项目实例仓库](https://github.com/a2aproject/a2a-samples/)

### 3) Example-first strategy

关于 Python 业务，优先关注 `samples/python`。
建议先通读 README，再定位与当前任务最接近的示例，最后再落地到本仓库。

Langgraph 示例值得你重点关注，这是我们项目用到的技术栈.

### 4) Notes

必要时可在沙箱或临时目录克隆示例仓库进行验证，但不要把示例代码原样复制进生产代码；优先抽取模式并结合本仓库规范实现。