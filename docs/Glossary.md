# 术语表

## AgentCard

Agent 的标准描述对象，用于暴露身份、能力、设备摘要、通信入口与元数据。

## Personal Agent

代表用户个体的 Agent，负责用户意图、个人上下文和近场空间绑定。

## Room Agent

代表单个房间的 Agent，负责房间状态、局部决策与设备控制闭环。

## Central Agent

代表全局策略和仲裁能力的 Agent，负责 `Global State`、策略与冲突处理。

## Room State

由 Room Agent 维护的房间级统一状态，包含设备状态、环境状态与房间模式。

## Global State

由 Central Agent 维护的家庭级抽象状态，包含家庭模式、风险等级、活跃用户和全局约束。

## Beacon API

把 `beacon_id` 映射为房间和目标 Agent 的后端接口集合。

## Registry API

负责注册、发现和查询 AgentCard 的后端接口集合。

## A2A

Agent-to-Agent 协议，用于 Agent 间任务、消息、结果与能力协作。

## A2ATask

A2A 中表示持续任务的对象，用于表达任务状态、结果与错误信息。

## capability

面向跨 Agent 协作暴露的能力标签，用于发现与能力筛选。

## skill

比 capability 更细粒度的动作或技能描述，通常用于表达某个 Agent 能做的具体事情。

## transport

客户端通信后端抽象。当前仓库中常见实现包括 `A2AControlTransport` 与 `MqttControlTransport`。
