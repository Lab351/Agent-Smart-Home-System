"""Home Agent 主程序入口

启动智能家居系统的数字人智能对话中心 + 中央协调智能体
"""

import asyncio
import signal
import sys
from pathlib import Path

import yaml

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent))

from core.central_agent import CentralAgent


def load_config(config_path: str = "config/default_config.yaml") -> dict:
    """加载配置文件

    Args:
        config_path: 配置文件路径

    Returns:
        配置字典
    """
    try:
        path = Path(config_path)
        if not path.exists():
            print(f"[Config] Config file not found: {config_path}")
            print("[Config] Using default configuration")
            return {}

        with open(path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)

        print(f"[Config] Loaded config from {config_path}")
        return config

    except Exception as e:
        print(f"[Config] Failed to load config: {e}")
        print("[Config] Using default configuration")
        return {}


async def start_rag_api():
    """启动RAG问答HTTP API服务"""
    try:
        from core.intelligent_qa_system.rag_http_api import app
        import uvicorn

        print("[RAG API] Starting RAG Question Answering HTTP API...")
        print("[RAG API] API will be available at http://0.0.0.0:8000")
        print("[RAG API] API Documentation: http://0.0.0.0:8000/docs")

        config = uvicorn.Config(
            app,
            host="0.0.0.0",
            port=8000,
            log_level="info"
        )
        server = uvicorn.Server(config)

        await server.serve()

    except ImportError as e:
        print(f"[RAG API] Failed to import RAG API: {e}")
        print("[RAG API] RAG API will not be available")
        print("[RAG API] Please ensure ML dependencies are installed:")
        print("[RAG API]   pip install sentence-transformers faiss-cpu pypdf2 pdfplumber python-docx")
    except Exception as e:
        print(f"[RAG API] Failed to start RAG API: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """主程序入口"""
    print("=" * 60)
    print("Home Agent - 数字人智能对话中心 + 中央协调智能体")
    print("=" * 60)

    # 加载配置
    config = load_config()

    # 创建Central Agent
    agent = CentralAgent(config)

    # 设置信号处理
    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    def signal_handler():
        print("\n[Main] Received shutdown signal")
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, signal_handler)

    # 启动任务列表
    tasks = []

    try:
        # 启动Central Agent
        print("[Main] Starting Central Agent...")
        tasks.append(asyncio.create_task(agent.start()))

        # 启动RAG API服务（在后台运行）
        print("[Main] Starting RAG API service...")
        tasks.append(asyncio.create_task(start_rag_api()))

        print("\n[Main] Home Agent is running. Press Ctrl+C to stop.")
        print("[Main] Active features:")
        print("  - Digital Human Q&A System (RAG-based)")
        print("    - Document: PDF, Word, Markdown support")
        print("    - Semantic Search: FAISS vector store")
        print("    - LLM Integration: DeepSeek, Qwen")
        print("    - HTTP API: http://0.0.0.0:8000/docs")
        print("  - Central Coordination:")
        print("    - Global state management")
        print("    - Cross-room conflict arbitration")
        print("    - Policy engine")
        print("    - System event broadcasting")
        print()

        # 等待停止信号
        await stop_event.wait()

    except KeyboardInterrupt:
        print("\n[Main] Received keyboard interrupt")
    except Exception as e:
        print(f"\n[Main] Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # 停止所有任务
        print("[Main] Shutting down...")

        # 取消所有任务
        for task in tasks:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        # 停止Agent
        try:
            await agent.stop()
        except Exception as e:
            print(f"[Main] Error stopping agent: {e}")

        print("[Main] Home Agent stopped")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
