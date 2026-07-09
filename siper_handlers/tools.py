"""A-class pure utility functions — extracted from siper_web.py main().

These functions have NO closure dependencies and use only module-level imports.
"""

import json
import logging
import os
import re as _re
import ssl
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse, unquote
import urllib.request as _urllib_request

logger = logging.getLogger("siper_web.handlers.tools")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Capability labels for discover_models
CAPABILITY_LABELS = {
    "text": "文本",
    "vision": "视觉",
    "code": "代码",
    "reasoning": "推理",
    "function_calling": "工具调用",
}


def _detect_provider(base_url):
    """Detect provider name from base URL."""
    if not base_url:
        return "custom"
    url = base_url.lower()
    providers = [
        ("openai.com", "openai"),
        ("anthropic", "anthropic"),
        ("deepseek", "deepseek"),
        ("moonshot", "moonshot"), ("kimi", "moonshot"),
        ("dashscope", "qwen"), ("qwen", "qwen"),
        ("longcat", "longcat"),
        ("sensenova", "sensenova"),
        ("zhipuai", "zhipuai"), ("glm", "zhipuai"),
        ("minimax", "minimax"),
        ("baichuan", "baichuan"),
        ("groq", "groq"),
        ("together", "together"),
        ("fireworks", "fireworks"),
        ("perplexity", "perplexity"),
        ("openrouter", "openrouter"),
        ("localhost", "local"), ("127.0.0.1", "local"),
    ]
    for pattern, name in providers:
        if pattern in url:
            return name
    return "custom"


def _estimate_context_window(model):
    """Estimate context window (tokens) from model name."""
    if not model:
        return 8192
    mid = model.lower()
    if "gpt-4o" in mid:
        return 128000
    if "gpt-4-turbo" in mid or "gpt-4-1106" in mid or "gpt-4-0125" in mid:
        return 128000
    if "gpt-4" in mid:
        return 8192
    if "gpt-3.5" in mid:
        return 16384
    if "claude-3" in mid or "claude-3.5" in mid:
        return 200000
    if "gemini-1.5" in mid or "gemini-2" in mid:
        return 1000000
    if "gemini" in mid:
        return 32768
    if "deepseek" in mid:
        return 65536
    if "qwen" in mid:
        return 32768
    if "longcat" in mid:
        return 1000000
    if "mixtral" in mid or "mistral" in mid:
        return 32768
    if "llama-3" in mid:
        return 8192
    if "llama-2" in mid:
        return 4096
    return 8192


def _get_file_category(filename):
    """Determine file category from extension."""
    ext = filename.lower().split(".")[-1] if "." in filename else ""
    categories = {
        "image": ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "tiff", "ico"],
        "video": ["mp4", "webm", "mov", "avi", "mkv", "flv", "m4v"],
        "audio": ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"],
        "document": ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md"],
        "archive": ["zip", "rar", "7z", "tar", "gz", "bz2"],
        "code": ["py", "js", "css", "html", "json", "xml", "sh", "bat", "ps1", "yml", "yaml"],
    }
    for cat, exts in categories.items():
        if ext in exts:
            return cat
    return "other"


def _extract_multipart_file(request, boundary):
    """Extract a single file from a multipart request body."""
    # Split by boundary
    parts = request.split("--" + boundary)
    for part in parts:
        if 'filename="' in part and "Content-Disposition" in part:
            # Extract filename
            fn_match = re.search(r'filename="([^"]+)"', part)
            filename = fn_match.group(1) if fn_match else ""
            # Extract content type
            ct_match = re.search(r"Content-Type:\s*([^\r\n]+)", part)
            content_type = ct_match.group(1).strip() if ct_match else "application/octet-stream"
            # Extract binary/content
            header_end = part.find("\r\n\r\n")
            if header_end == -1:
                continue
            content = part[header_end + 4:]
            # Trim trailing \r\n--
            if content.endswith("\r\n"):
                content = content[:-2]
            if content.endswith("--"):
                content = content[:-2]
            return content, filename, content_type
    return None, None, None


def _extract_multipart_field(request, boundary):
    """Extract a field value from a multipart request body."""
    parts = request.split("--" + boundary)
    for part in parts:
        if "Content-Disposition: form-data" in part and 'name="' in part:
            if 'filename="' in part:
                continue  # Skip file fields
            name_match = re.search(r'name="([^"]+)"', part)
            if name_match:
                field_name = name_match.group(1)
                value_start = part.find("\r\n\r\n")
                if value_start == -1:
                    continue
                value = part[value_start + 4:]
                if value.endswith("\r\n"):
                    value = value[:-2]
                return value
    return None


def api_discover_models(body):
    """Fetch available models from a provider.
    
    Body: {"base_url": "...", "api_key": "..."}
    Returns: {"success": true, "models": [...], "provider": "...", "count": N}
    """
    base_url = (body.get("base_url") or "").rstrip("/")
    api_key = body.get("api_key", "")
    if not base_url:
        return {"success": False, "error": "Base URL 不能为空"}
    
    if base_url.endswith("/v1"):
        models_url = base_url + "/models"
    else:
        models_url = base_url + "/v1/models"
    
    try:
        req = _urllib_request.Request(
            models_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="GET",
        )
        ctx = ssl.create_default_context()
        if base_url.startswith(('http://', 'https://localhost', 'https://127.0.0.1', 'https://10.', 'https://192.168.', 'https://172.')):
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        resp = _urllib_request.urlopen(req, timeout=10, context=ctx)
        raw = json.loads(resp.read().decode("utf-8"))
        raw_models = raw.get("data") or raw.get("models") or (raw if isinstance(raw, list) else [])
        provider = _detect_provider(base_url)
        models_list = []
        
        for m in raw_models:
            mid = m.get("id", m.get("name", ""))
            if not mid:
                continue
            caps = []
            m_caps = m.get("capabilities", {})
            if isinstance(m_caps, dict):
                cap_map = {
                    "vision": ["image", "vision", "multimodal", "image_input"],
                    "reasoning": ["reasoning", "chain_of_thought", "cot"],
                    "code": ["code", "coding", "code_interpreter"],
                    "function_calling": ["tool_call", "function_calling", "tools", "function_call"],
                }
                for cap_name, keywords in cap_map.items():
                    if any(kw in m_caps and m_caps[kw] for kw in keywords):
                        caps.append(cap_name)
            
            models_list.append({
                "id": mid,
                "name": m.get("name") or mid,
                "provider": provider,
                "capabilities": caps,
                "owned_by": m.get("owned_by", ""),
            })
        
        return {
            "success": True,
            "models": models_list,
            "provider": provider,
            "count": len(models_list),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
