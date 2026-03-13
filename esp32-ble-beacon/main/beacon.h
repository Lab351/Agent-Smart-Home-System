/* Beacon Manufactory Data Type

| Byte | 含义 |
|----|----|
| 0-1 | Company ID (自定义，比如 0xFFFE) |
| 2   | Beacon 类型 (0x01 = agent) |
| 3   | 协议版本 |
| 4-7 | agent_id (uint32) |
| 8   | capability bitmap |
| 9   | agent 状态 |

*/