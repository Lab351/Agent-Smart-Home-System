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

本 skill 的目标不是泛泛提醒“去看文档”，而是帮助你快速找到 **最小正确实现路径**。若官方 SDK 已提供现成入口（例如 `to_a2a` 之类的适配方法），优先使用，不要先手写协议胶水层。

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

### 4) Fast-path checklist

在开始设计自定义 adapter、gateway 或 HTTP 包装器之前，先按下面顺序检查：

1. 官方示例或 README 是否已经提供当前任务的直接模式。
2. 当前 agent/graph/runner 是否已有 `to_a2a`、`as_a2a`、`agent_card`、`build_app`、`serve` 等直接暴露服务的方法。
3. SDK 是否已经提供 Starlette/FastAPI/ASGI 集成；若有，优先复用，不要自己手写 request/response envelope。
4. 只有在官方入口无法覆盖仓库需求时，才实现自定义 transport wiring。

如果用户的问题是“怎么最简单把 agent 变成服务”，默认先验证以下思路，而不是先构造底层 handler：

1. 现有 agent 对象是否可以直接调用 `to_a2a(...)`。
2. `to_a2a(...)` 的返回值是否已经是可挂载的 A2A app / handler / server。
3. 仅在返回值不能直接暴露网络服务时，才补一层 ASGI 或框架集成。

### 5) Repo-specific guidance

结合本仓库，优先复用已有“单次执行”入口，再把它接到 A2A 服务层，而不是重写业务逻辑：

1. `room-agent/app/test_cli.py` 提供单次图执行测试入口，`room-agent/app/server.py` 提供正式服务入口。
2. 若要服务化 `room-agent`，先检查 graph runner 或 agent facade 是否可直接 `to_a2a`。
3. 若无现成 facade，再新增薄包装层，把图执行逻辑接到 SDK 提供的 A2A service/app，而不是直接手写协议细节。

### 6) Implementation rules

1. 回答或实现前，明确说明你找到的官方快捷入口是什么；若没找到，也要明确说“已检查，未发现 `to_a2a` 一类入口”。
2. 若使用官方快捷入口，优先给出最小可运行骨架，而不是泛化架构图。
3. 若需要自行封装，说明为什么官方高层接口不够用，以及缺口在哪里。
4. 不要默认从底层类（如手写 handler、card、transport）开始，除非源码或官方示例明确这么要求。

### 7) Notes

必要时可在沙箱或临时目录克隆示例仓库进行验证，但不要把示例代码原样复制进生产代码；优先抽取模式并结合本仓库规范实现。
