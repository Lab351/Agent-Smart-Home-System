# Room Agent LangGraph Graph 规划（已废弃）

**本文档已过期，请参考 `docs/ARCHITECTURE.md` 了解当前实现架构。**

本文档描述的规划架构与实际实现不符，保留仅供历史参考。

## 主要差异

文档规划的架构：
```
tool_selection -> tool_call_planning -> execute
```

实际实现的架构：
```
tool_selection -> agent_execution (ReAct subgraph)
```

实际采用了完整的 ReAct Agent 执行模式，包含多步迭代、自主规划和工具调用，而非文档中描述的单步 tool_call_planning 节点。

详见当前架构文档：`docs/ARCHITECTURE.md`
