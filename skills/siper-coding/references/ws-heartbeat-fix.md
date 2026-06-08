# WS Heartbeat Fix Pattern (v0.6.13)

## Problem

WSL2 localhost forwarding silently drops TCP connections. Chrome WS `readyState` stays at 1 (OPEN) but siper backend receives no data. This affects both:
1. **WS message delivery** — browser sends messages, siper never receives them
2. **urllib HTTP requests** — TCP reuse on stale connections returns empty reads, triggering false "empty response" errors from LLM client

## Root Cause

WSL2's NAT-based localhost forwarding silently drops idle TCP connections. Chrome's WebSocket implementation doesn't detect this — `readyState` stays OPEN and `ws.send()` appears to succeed (data goes to browser's send buffer) but never reaches the server.

## What DOESN'T Work

**Client-side heartbeat alone is ineffective.** `setInterval(() => ws.send(ping), 15000)` does NOT prevent WSL2 TCP silent disconnect. The ping messages are silently lost at the NAT layer. Confirmed in session 2026-05-16: client-side heartbeat was added then removed (commits `4cf96d8` -> `5692c4f`) because it didn't help.

## What DOES Work: Server-Side Timeout + Close

The reliable fix is **server-side timeout detection with forced close**. This is the CRITICAL fix that actually works.

### Backend (siper_web.py)

Replace `async for raw in ws:` with explicit loop:

```python
while True:
    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=60)
    except asyncio.TimeoutError:
        logger.warning(f"WS conn {conn_id} 60s no data, closing to force reconnect")
        await ws.close()
        break
    # ... existing message handling ...
```

**Why this works**: When WSL2 silently drops TCP, `ws.recv()` blocks forever. `asyncio.wait_for` cancels it after 60s. Server closes connection -> browser `onclose` fires -> `setTimeout(connectWS, 3000)` reconnects.

### Browser Side (core.js) — Reconnect Only

No heartbeat needed. Just reconnect on close:

```javascript
ws.onclose = (e) => {
  setConnected(false);
  setTimeout(connectWS, 3000);
};
```

## Recovery Timeline

1. WSL2 drops TCP -> server `ws.recv()` blocks
2. 60s later -> `TimeoutError` -> server `ws.close()`
3. Browser `onclose` fires -> 3s delay -> `connectWS()`
4. New TCP connection established -> works normally

Maximum downtime: ~63s. Often faster since browser detects dead connection sooner.

## LLM Empty Response Is a Symptom

When WSL2 TCP silent disconnect affects urllib's HTTP to LLM API:
- `resp.read()` returns empty bytes -> `llm_client.py:83` triggers empty response retry
- After 3 retries -> `llm_client.py:92` returns error message
- Frontend displays "连续 3 次返回空响应，请检查 API 服务或稍后重试"

**If curl tests API normally but siper shows "empty response" AND WS is unstable -> root cause is WSL2 network, not the API service.**

## Commits

- `4cf96d8` — initial fix (client heartbeat + server timeout)
- `5692c4f` — removed client heartbeat (ineffective), kept server timeout
