# core/intelligent-qa-system/mcp_tools/rag_search.py
"""RAG 知识库搜索工具（MCP Tool 版本）

作为 MCP Server 的一部分，提供 RAG 检索能力
"""
import requests


class RAGSearchTool:
    """RAG 知识库搜索工具
    
    调用本地 RAG HTTP API 进行知识库检索
    
    Attributes:
        name: 工具名称
        description: 工具描述
    """
    
    name = "search_knowledge_base"
    description = (
        "在内部知识库中搜索相关文档，"
        "适用于：背景查询、资料检索、事实核对。"
    )
    
    async def __call__(
        self, 
        query: str, 
        top_k: int = 5, 
        min_score: float = 0.3
    ) -> dict:
        """调用本地 RAG HTTP API 进行搜索
        
        Args:
            query: 搜索查询字符串
            top_k: 返回结果数量，默认 5
            min_score: 最小相似度分数，默认 0.3
            
        Returns:
            dict: 搜索结果，包含：
                - success: 是否成功
                - result: 原始结果（成功时）
                - error: 错误信息（失败时）
                - query: 查询字符串
                - total: 结果数量
        """
        try:
            print(f"🔍 [RAG Tool] 开始搜索: {query}")
            
            # 调用本地 RAG HTTP API
            resp = requests.post(
                "http://127.0.0.1:9000/rag/search",
                json={"query": query},
                timeout=30,
                headers={"Content-Type": "application/json"}
            )
            resp.raise_for_status()
            raw_result = resp.json()
            
            # 提取结果
            results = raw_result.get('results', [])
            
            print(f"✅ [RAG Tool] 搜索成功，返回 {len(results)} 条结果")
            
            # 格式化输出
            formatted_output = self._format_results(results)
            
            print(f"📝 [RAG Tool] 格式化输出: {formatted_output[:200]}")
            
            return {
                "success": True,
                "result": raw_result,  # 原始结果
                "formatted_output": formatted_output,  # 格式化文本（用于对话）
                "query": query,
                "total": len(results)
            }
        
        except requests.exceptions.RequestException as e:
            print(f"❌ [RAG Tool] 搜索失败: {type(e).__name__} - {e}")
            return {
                "success": False,
                "error": str(e),
                "query": query,
                "result": None,
                "formatted_output": "搜索失败"
            }
    
    def _format_results(self, results: list) -> str:
        """格式化搜索结果为可读文本
        
        Args:
            results: 搜索结果列表
            
        Returns:
            str: 格式化后的文本
        """
        if not results:
            return "未找到相关信息"
        
        formatted = []
        for i, doc in enumerate(results[:3], 1):  # 只取前3条
            source = doc.get('source', '未知来源')
            content = doc.get('content', '')
            score = doc.get('score', 0)
            
            formatted.append(
                f"{i}. {content[:200]}\n"
                f"   来源: {source} (相关度: {score:.2f})"
            )
        
        return "\n\n".join(formatted)