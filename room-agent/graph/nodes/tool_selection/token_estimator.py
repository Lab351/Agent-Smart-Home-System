"""Fast token estimation helpers for tool catalog rendering."""

from __future__ import annotations

import tiktoken


QWEN_TOKEN_ESTIMATION_ENCODING = "cl100k_base"
ENCODING = tiktoken.get_encoding(QWEN_TOKEN_ESTIMATION_ENCODING)


def estimate_text_tokens(text: str) -> int:
    """Estimate token count with a fixed tokenizer for stable approximate gating."""
    if not text:
        return 0

    return len(ENCODING.encode(text))
