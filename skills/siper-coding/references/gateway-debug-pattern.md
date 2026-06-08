# Gateway Control Debug Pattern

## Problem: LLM Client "Start" Button Appears Ineffective

### Symptom
- LLM Client status shows "stopped"
- Clicking "启动" (Start) button returns success
- Status refreshes to "running"
- But actual LLM calls fail (empty response)

### Root Cause
When restarting LLM Client via `api_control_gateway`, the code calls:
```python
agent.configure_llm(
    api_key=os.environ.get("LONGCAT_API_KEY", ""),  # Empty string if not set
    base_url="https://api.longcat.chat/openai",
    model="LongCat-2.0-Preview",
)
```

If `LONGCAT_API_KEY` is not set in environment, `api_key=""` is passed to `LLMClient.__init__`, which creates a client with empty API key. The client object exists (so `agent.llm_client` is truthy), but API calls fail silently.

### Fix

**Backend (`siper_web.py` - api_control_gateway):**
```python
elif service_name == "LLM Client":
    try:
        api_key = os.environ.get("LONGCAT_API_KEY", "")
        if not api_key:
            return {"success": False, "error": "LONGCAT_API_KEY 未设置，无法启动 LLM Client"}
        agent.configure_llm(
            api_key=api_key,
            base_url="https://api.longcat.chat/openai",
            model="LongCat-2.0-Preview",
        )
        return {"success": True, "service": service_name, "message": "LLM Client re-initialized"}
    except Exception as e:
        return {"success": False, "error": str(e)}
```

**Frontend (`page-gateway.js` - controlGateway):**
```javascript
const r = await fetch('/api/gateway', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(body),
});
if (!r.ok) throw new Error('HTTP ' + r.status);  // Add HTTP status check
const d = await r.json();
```

### Verification
```bash
# Check if LONGCAT_API_KEY is set
echo $LONGCAT_API_KEY

# Test gateway API directly
curl -X POST http://127.0.0.1:9724/api/gateway \
  -H "Content-Type: application/json" \
  -d '{"action": "restart", "service": "LLM Client"}'
```

### Files Modified
- `siper_web.py` (api_control_gateway - LLM Client restart branch)
- `webui/static/pages/page-gateway.js` (controlGateway - HTTP status check)

## Related Pitfalls
1. **Empty API key creates valid client object**: `LLMClient.__init__` doesn't validate api_key, so `agent.llm_client` is truthy even with empty key
2. **Frontend HTTP errors silent**: Without `r.ok` check, non-200 responses are passed to `r.json()` which may throw, caught by generic try/catch with generic error message
