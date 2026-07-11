"""
LLM Client - OpenAI SDK-based LLM API client.

Supports OpenAI-compatible endpoints (OpenAI, DeepSeek, etc.)
Uses the official OpenAI Python SDK for connection pooling, keepalive,
automatic retries, and structured error handling.
"""
import json
import logging
import re
import time
from typing import Dict, List, Optional, Tuple, Generator, Any

from openai import OpenAI, APIError, APIConnectionError, APITimeoutError, RateLimitError


def _filter_tool_call_xml(text: str) -> str:
    """Remove tool call XML tags from text content."""
    if not text:
        return text
    text = re.sub(r'<longcat_tool_call>[\s\S]*?</longcat_tool_call>', '', text)
    text = re.sub(r'<execute_command>[\s\S]*?</execute_command>', '', text)
    text = re.sub(r'', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


class LLMClient:
    """Client for OpenAI-compatible LLM APIs using the official SDK."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "",
        model: str = "",
        timeout: int = 300,
        max_retries: int = 3,
        max_tokens: int = 8192,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.max_retries = max_retries
        self.max_tokens = max_tokens
        self.logger = logging.getLogger("llm_client")

        self.client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            timeout=self.timeout,
            max_retries=self.max_retries,
        )

    def _build_payload(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict]] = None,
        temperature: float = 0.7,
        max_tokens: int = 0,
    ) -> Dict:
        payload: Dict = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens if max_tokens > 0 else self.max_tokens,
        }
        if tools:
            payload["tools"] = tools
            if "sensenova" not in self.base_url:
                payload["tool_choice"] = "auto"
        return payload

    def _parse_response(self, message) -> Dict[str, Any]:
        """Parse an OpenAI SDK message object into our standard dict format."""
        content = getattr(message, "content", None) or ""
        tool_calls_raw = getattr(message, "tool_calls", None)

        normalized_tool_calls = None
        if tool_calls_raw:
            normalized_tool_calls = []
            for tc in tool_calls_raw:
                func = tc.function
                args_str = getattr(func, "arguments", "{}") or "{}"
                try:
                    params = json.loads(args_str)
                except (json.JSONDecodeError, TypeError):
                    params = {}
                normalized_tool_calls.append({
                    "id": getattr(tc, "id", ""),
                    "name": getattr(func, "name", ""),
                    "parameters": params,
                })

        return {
            "content": content,
            "tool_calls": normalized_tool_calls,
            "usage": {},
            "finish_reason": "",
        }

    def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict]] = None,
        temperature: float = 0.7,
        max_tokens: int = 0,
    ) -> Dict[str, Any]:
        """
        Send a non-streaming chat completion request.

        Returns:
            Dict with 'content', 'tool_calls', 'usage', 'finish_reason'.
        """
        payload = self._build_payload(messages, tools, temperature, max_tokens)

        last_error = None
        for attempt in range(3):
            if attempt > 0:
                delay = 2 ** (attempt - 1)
                self.logger.warning(f"LLM 请求重试 {attempt}/2，等待 {delay}s...")
                time.sleep(delay)

            try:
                self.logger.debug(f"发送非流式请求到 {self.base_url}, 模型={self.model}, 尝试={attempt+1}")
                response = self.client.chat.completions.create(**payload)
            except RateLimitError as e:
                self.logger.warning(f"API 限流(429)（尝试 {attempt+1}/3）：{e}")
                last_error = e
                # RateLimitError triggers retry with backoff below
                if attempt < 2:
                    delay = 2 ** attempt
                    self.logger.info(f"限流退避等待 {delay}s...")
                    time.sleep(delay)
                    continue
                return {
                    "content": "[LLM API 错误：请求过于频繁，请稍后重试]",
                    "tool_calls": None,
                    "usage": {},
                    "finish_reason": "error",
                }
            except APITimeoutError as e:
                self.logger.warning(f"API 超时（尝试 {attempt+1}/3）：{e}")
                last_error = e
                continue
            except APIConnectionError as e:
                self.logger.warning(f"API 连接失败（尝试 {attempt+1}/3）：{e}")
                last_error = e
                continue
            except APIError as e:
                self.logger.error(f"API 错误：HTTP {e.status_code}: {e.message}")
                msg = str(e.message)[:200]
                return {
                    "content": f"[LLM API 错误：HTTP {e.status_code}] {msg}",
                    "tool_calls": None,
                    "usage": {},
                    "finish_reason": "error",
                }
            except Exception as e:
                err_msg = str(e)
                if "JSONDecodeError" in type(e).__name__ or "Expecting value" in err_msg:
                    self.logger.warning(f"API 返回空响应（尝试 {attempt+1}/3）：{e}")
                    last_error = e
                    continue
                self.logger.error(f"API 请求异常：{e}")
                return {
                    "content": "[LLM API 错误：服务暂时没有响应，请稍后重试]",
                    "tool_calls": None,
                    "usage": {},
                    "finish_reason": "error",
                }

            try:
                choice = response.choices[0]
                message = choice.message
                result = self._parse_response(message)
                # Filter tool call XML from content
                result["content"] = _filter_tool_call_xml(result["content"])
                usage_obj = getattr(response, "usage", None)
                if usage_obj:
                    result["usage"] = {
                        "prompt_tokens": getattr(usage_obj, "prompt_tokens", 0),
                        "completion_tokens": getattr(usage_obj, "completion_tokens", 0),
                        "total_tokens": getattr(usage_obj, "total_tokens", 0),
                    }
                result["finish_reason"] = getattr(choice, "finish_reason", "stop")

                self.logger.info(
                    f"LLM 响应：{len(result['content'])} 字符，"
                    f"工具调用={len(result['tool_calls']) if result['tool_calls'] else 0}，"
                    f"token 用量={result['usage']}"
                )
                return result
            except (IndexError, AttributeError) as e:
                self.logger.error(f"解析 LLM 响应失败：{e}")
                return {
                    "content": "",
                    "tool_calls": None,
                    "usage": {},
                    "finish_reason": "error",
                }

        # All retries exhausted
        self.logger.error(f"LLM 请求重试 3 次后仍失败：{last_error}")
        return {
            "content": f"[LLM API 错误：请求异常] {last_error}",
            "tool_calls": None,
            "usage": {},
            "finish_reason": "error",
        }

    def _stream_inner(
        self,
        payload: Dict,
    ):
        """Inner generator that performs a single streaming attempt."""
        try:
            self.logger.debug(f"发送流式请求到 {self.base_url}, 模型={self.model}")
            stream = self.client.chat.completions.create(**payload)
        except RateLimitError as e:
            self.logger.warning(f"流式请求 API 限流(429)：{e}")
            raise  # Let retry loop handle it with backoff
        except APIConnectionError as e:
            raise  # Let retry loop handle it
        except APIError as e:
            self.logger.error(f"流式请求 API 错误：HTTP {e.status_code}: {e.message}")
            yield {"delta": f"[LLM API 错误：HTTP {e.status_code}] {str(e.message)[:200]}", "finish_reason": "error", "tool_calls": None, "usage": None}
            return
        except Exception as e:
            err_msg = str(e)
            if "JSONDecodeError" in type(e).__name__ or "Expecting value" in err_msg:
                raise  # Let retry loop handle empty body
            self.logger.error(f"流式请求异常：{e}")
            yield {"delta": "[LLM API 错误：服务暂时没有响应，请稍后重试]", "finish_reason": "error", "tool_calls": None, "usage": None}
            return

        # Accumulate tool calls across chunks (SDK sends partial tool_call deltas)
        acc_tool_calls: Dict[int, Dict] = {}
        finish_reason = None
        chunk_count = 0

        try:
            for chunk in stream:
                chunk_count += 1
                choices = getattr(chunk, "choices", None)
                if not choices:
                    # 检查是否是 usage-only chunk（stream_options.include_usage 时最后一个 chunk 无 choices）
                    usage_obj = getattr(chunk, "usage", None)
                    if usage_obj:
                        yield {
                            "delta": "",
                            "finish_reason": None,
                            "tool_calls": None,
                            "usage": {
                                "prompt_tokens": getattr(usage_obj, "prompt_tokens", 0),
                                "completion_tokens": getattr(usage_obj, "completion_tokens", 0),
                                "total_tokens": getattr(usage_obj, "total_tokens", 0),
                            },
                        }
                    continue
                choice = choices[0]
                delta = getattr(choice, "delta", None)
                if delta is None:
                    continue

                delta_content = getattr(delta, "content", "") or ""
                # Capture reasoning_content (DeepSeek R1, etc.)
                reasoning_content = getattr(delta, "reasoning_content", "") or ""
                # DEBUG: log raw delta content for first 3 chunks
                if chunk_count <= 3:
                    self.logger.info(f"[_stream_inner] chunk#{chunk_count}: delta.content={getattr(delta, 'content', 'MISSING')!r}, reasoning={reasoning_content[:50]!r}, delta.tool_calls={getattr(delta, 'tool_calls', 'MISSING')}, finish_reason={getattr(choice, 'finish_reason', 'MISSING')}")
                # Filter out tool call XML that some models embed in content
                delta_content = _filter_tool_call_xml(delta_content)

                # Accumulate tool calls from delta
                delta_tool_calls = getattr(delta, "tool_calls", None)
                if delta_tool_calls:
                    for tc in delta_tool_calls:
                        idx = getattr(tc, "index", 0)
                        if idx not in acc_tool_calls:
                            acc_tool_calls[idx] = {"id": "", "name": "", "arguments_chars": []}
                        entry = acc_tool_calls[idx]
                        tc_id = getattr(tc, "id", None)
                        if tc_id:
                            entry["id"] = tc_id
                        func = getattr(tc, "function", None)
                        if func:
                            func_name = getattr(func, "name", None)
                            if func_name:
                                entry["name"] = func_name
                            func_args = getattr(func, "arguments", None)
                            if func_args:
                                entry["arguments_chars"].append(func_args)

                fr = getattr(choice, "finish_reason", None)
                if fr:
                    finish_reason = fr

                usage_obj = getattr(chunk, "usage", None)
                usage_dict = None
                if usage_obj:
                    usage_dict = {
                        "prompt_tokens": getattr(usage_obj, "prompt_tokens", 0),
                        "completion_tokens": getattr(usage_obj, "completion_tokens", 0),
                        "total_tokens": getattr(usage_obj, "total_tokens", 0),
                    }

                # 构建 tool_calls 列表（从累积的 acc_tool_calls 转换）
                tool_calls_list = None
                if acc_tool_calls:
                    tool_calls_list = []
                    for idx in sorted(acc_tool_calls.keys()):
                        entry = acc_tool_calls[idx]
                        args_str = ''.join(entry["arguments_chars"])
                        try:
                            args_obj = json.loads(args_str) if args_str else {}
                        except (json.JSONDecodeError, TypeError):
                            args_obj = {"_raw": args_str}
                        tool_calls_list.append({
                            "id": entry.get("id", ""),
                            "type": "function",
                            "function": {
                                "name": entry.get("name", ""),
                                "arguments": args_obj,
                            },
                        })

                # Yield special thinking event if reasoning_content present
                if reasoning_content:
                    yield {"thinking": reasoning_content}

                yield {
                    "delta": delta_content,
                    "finish_reason": None,
                    "tool_calls": tool_calls_list,
                    "usage": usage_dict,
                }
        except Exception as e:
            self.logger.error(f"流式读取异常：{e}")
            yield {"delta": f"[LLM API 错误：流式读取异常] {e}", "finish_reason": "error", "tool_calls": None, "usage": None}
            return

        # Empty stream detection
        if chunk_count == 0:
            self.logger.warning("LLM 流式请求返回空响应（0 个 chunk）")
            yield {"delta": "", "finish_reason": "empty_stream", "tool_calls": None, "usage": None}
            return

        self.logger.debug(f"流式响应完成：{chunk_count} 个 chunk，finish_reason={finish_reason}")

        # Build final accumulated tool_calls
        normalized_tool_calls = None
        if acc_tool_calls:
            normalized_tool_calls = []
            for idx in sorted(acc_tool_calls.keys()):
                entry = acc_tool_calls[idx]
                args_str = "".join(entry["arguments_chars"])
                try:
                    params = json.loads(args_str) if args_str else {}
                except (json.JSONDecodeError, TypeError):
                    params = {}
                normalized_tool_calls.append({
                    "id": entry["id"],
                    "name": entry["name"],
                    "parameters": params,
                })

        yield {
            "delta": "",
            "finish_reason": finish_reason or "stop",
            "tool_calls": normalized_tool_calls,
            "usage": None,
        }

    def chat_completion_stream(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict]] = None,
        temperature: float = 0.7,
        max_tokens: int = 0,
    ):
        """
        Send a streaming chat completion request (with retry).

        Yields dicts with keys:
            - delta: str — incremental text content
            - tool_calls: list|None — accumulated tool calls when available
            - finish_reason: str|None — set on last chunk
            - usage: dict|None — token usage
        """
        payload = self._build_payload(messages, tools, temperature, max_tokens)
        payload["stream"] = True
        payload["stream_options"] = {"include_usage": True}

        last_error = None
        for attempt in range(2):
            if attempt > 0:
                delay = 1
                self.logger.warning(f"流式请求重试 {attempt}/1，等待 {delay}s...")
                time.sleep(delay)

            had_delta = False
            error_yielded = False
            empty_stream = False
            _xml_state = 0  # 0=normal, 1=in-longcat, 2=in-execute
            _xml_buffer = ""
            try:
                for item in self._stream_inner(payload):
                    if item.get("finish_reason") == "error":
                        error_yielded = True
                    if item.get("finish_reason") == "empty_stream":
                        empty_stream = True
                    if item.get("delta"):
                        had_delta = True
                        delta = item["delta"]
                        
                        # State machine for XML filtering across chunks
                        result_parts = []
                        pos = 0
                        while pos < len(delta):
                            if _xml_state == 0:
                                # Normal state: look for opening tags
                                lc_idx = delta.find('<longcat_tool_call>', pos)
                                ec_idx = delta.find('<execute_command>', pos)
                                
                                if lc_idx == -1 and ec_idx == -1:
                                    # No XML tags, yield rest
                                    result_parts.append(delta[pos:])
                                    break
                                elif lc_idx != -1 and (ec_idx == -1 or lc_idx < ec_idx):
                                    # Found <longcat_tool_call> first
                                    if lc_idx > pos:
                                        result_parts.append(delta[pos:lc_idx])
                                    _xml_state = 1
                                    pos = lc_idx + len('<longcat_tool_call>')
                                else:
                                    # Found <execute_command> first
                                    if ec_idx > pos:
                                        result_parts.append(delta[pos:ec_idx])
                                    _xml_state = 2
                                    pos = ec_idx + len('<execute_command>')
                                    
                            elif _xml_state == 1:
                                # In <longcat_tool_call>, look for closing tag
                                close_idx = delta.find('</longcat_tool_call>', pos)
                                if close_idx == -1:
                                    # Closing tag not in this chunk, buffer and break
                                    _xml_buffer = delta[pos:]
                                    break
                                else:
                                    # Found closing tag, skip content, return to normal
                                    pos = close_idx + len('</longcat_tool_call>')
                                    _xml_state = 0
                                    
                            elif _xml_state == 2:
                                # In <execute_command>, look for closing tag
                                close_idx = delta.find('</execute_command>', pos)
                                if close_idx == -1:
                                    # Closing tag not in this chunk, buffer and break
                                    _xml_buffer = delta[pos:]
                                    break
                                else:
                                    # Found closing tag, skip content, return to normal
                                    pos = close_idx + len('</execute_command>')
                                    _xml_state = 0
                        
                        # Yield filtered content
                        if result_parts:
                            filtered = ''.join(result_parts)
                            if filtered:
                                yield {**item, "delta": filtered}
                            else:
                                # XML 过滤后内容为空，yield 原始 delta 避免丢失数据
                                yield item
                        else:
                            # 没有 XML 标签需要过滤，yield 原始 item
                            yield item
                    else:
                        # Final chunk or non-delta item — flush any buffered XML content
                        if _xml_buffer:
                            # Buffer should be discarded (it's incomplete XML)
                            _xml_buffer = ""
                        yield item
            except (RateLimitError, APIConnectionError) as e:
                last_error = e
                self.logger.warning(f"流式请求第 {attempt+1}/3 次尝试异常：{type(e).__name__}，准备重试...")
                continue
            except Exception as e:
                self.logger.error(f"流式请求不可恢复异常：{e}")
                yield {"delta": f"[LLM API 错误：{e}]", "finish_reason": "error", "tool_calls": None, "usage": None}
                return

            # Success: we got deltas and no error
            if had_delta and not error_yielded:
                return

            # If we got an error yield, don't retry (it's a RateLimitError etc.)
            if error_yielded:
                return

            # Empty stream — retry
            if empty_stream:
                last_error = RuntimeError("empty_stream_or_connection")
                self.logger.warning(f"流式请求第 {attempt+1}/2 次尝试空响应，准备重试...")
                continue

            # Empty stream or connection error — retry
            last_error = RuntimeError("empty_stream_or_connection")
            self.logger.warning(f"流式请求第 {attempt+1}/2 次尝试无响应，准备重试...")

        # All retries exhausted — but we already yielded what we could
        self.logger.error(f"流式请求重试 2 次后仍失败：{last_error}")


