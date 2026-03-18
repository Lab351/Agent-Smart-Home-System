# Room Agent 说明

Room Agent 的正式职责、状态模型和能力边界已合并到：

- [系统总览](../system-overview.md)
- [通信协议](../communication.md)

当前有效结论：

- Room Agent 是 `Room State` 的唯一权威源。
- Room Agent 负责房间级规则执行、状态聚合和设备控制闭环。
- Room Agent 不负责用户意图理解，也不负责全局仲裁。
