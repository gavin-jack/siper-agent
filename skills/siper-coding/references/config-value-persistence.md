# Config Value Persistence — max_tools / max_tool_rounds

## Required Values

| Key | Required Value | Location |
|-----|---------------|----------|
| `max_tools` | **300** | `agents/default/config.json` |
| `max_tool_rounds` | **100** | `agents/default/config.json` |

## Why These Values

- `max_tools: 300` — Per-round tool call limit. Default 30 is too low for complex tasks.
- `max_tool_rounds: 100` — Total tool round limit. Default 3 causes premature truncation.

## Config Override Trap

`agents/default/config.json` values override `AgentConfig` dataclass defaults. If config.json has old values (30/3), the code defaults (300/100) are ignored.

**Always verify after any config restore/revert:**
```bash
grep -n 'max_tools\|max_tool_rounds' agents/default/config.json
```

Expected output:
```
"max_tools": 300,
"max_tool_rounds": 100,
```

## All 6 Locations That Must Match

1. `ai_agent/core/agent.py` — `AgentConfig.max_tool_rounds` default = 100
2. `agents/default/config.json` — `max_tools: 300`, `max_tool_rounds: 100`
3. `agents/__init__.py` — `cfg.get("max_tools", 300)`, `cfg.get("max_tool_rounds", 100)`
4. `siper_web.py` line ~1091 — `cfg.get("max_tools", 300)`, `cfg.get("max_tool_rounds", 100)`
5. `siper_web.py` line ~351 — applies config.json values to agent.config
6. `webui/templates/index.html` — input box max values (500 for max_tools, 200 for max_tool_rounds)

## Common Revert Scenarios

- `.bak` restore of config.json may revert to old values
- Windows deployment package sync may overwrite with old values
- New agent creation may use template defaults (30/3)

## Verification Command

```bash
curl -s http://127.0.0.1:9724/api/config | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('max_tools:', d.get('max_tools'))
print('max_tool_rounds:', d.get('max_tool_rounds'))
"
```

Expected: `max_tools: 300`, `max_tool_rounds: 100`
