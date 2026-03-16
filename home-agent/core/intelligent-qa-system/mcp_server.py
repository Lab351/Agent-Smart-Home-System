#!/usr/bin/env python3
"""RAG MCP Server

提供 RAG 能力的 MCP Server，供其他 Agent 调用

启动方式:
    python mcp_server.py
    
配置方式:
    在 MCP client 配置中添加此 server
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from mcp.server import Server
from mcp.types import Tool, TextContent
from mcp_tools.rag_search import RAGSearchTool

# 创建 MCP Server
app = Server("rag-server")

# 实例化工具
rag_tool = RAGSearchTool()


@app.list_tools()
async def list_tools():
    """列出所有可用工具
    
    Returns:
        List[Tool]: 工具列表
    """
    return [
        Tool(
            name=rag_tool.name,
            description=rag_tool.description,
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索查询字符串"
                    },
                    "top_k": {
                        "type": "number",
                        "description": "返回结果数量",
                        "default": 5
                    },
                    "min_score": {
                        "type": "number",
                        "description": "最小相似度分数",
                        "default": 0.3
                    }
                },
                "required": ["query"]
            }
        )
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict):
    """调用工具
    
    Args:
        name: 工具名称
        arguments: 工具参数
        
    Returns:
        List[TextContent]: 工具执行结果
        
    Raises:
        ValueError: 未知工具
    """
    if name == rag_tool.name:
        # 调用 RAG 工具
        result = await rag_tool(**arguments)
        
        # 返回结果
        return [TextContent(
            type="text",
            text=str(result)
        )]
    else:
        raise ValueError(f"Unknown tool: {name}")


async def main():
    """主函数"""
    print("="*60)
    print("🚀 RAG MCP Server")
    print("="*60)
    print(f"Server: rag-server")
    print(f"Tool: {rag_tool.name}")
    print(f"Description: {rag_tool.description}")
    print("="*60)
    print("\n等待 MCP client 连接...\n")
    
    # 运行 MCP server
    await app.run()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n👋 RAG MCP Server 已停止")