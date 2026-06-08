# Token Database Separation

## Overview
Token usage data was migrated from per-agent `sessions.db` to a shared `agents/token.db` at the agents folder root. All agents write to this single database, with an `agent` field to distinguish sources.

## Schema
```sql
-- Model deduplication table
CREATE TABLE token_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

-- Token usage records
CREATE TABLE token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent TEXT NOT NULL DEFAULT '',
    model_id INTEGER REFERENCES token_models(id),
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    ts INTEGER NOT NULL  -- unix epoch, not TEXT
);

CREATE INDEX idx_token_usage_ts ON token_usage(ts);
CREATE INDEX idx_token_usage_agent ON token_usage(agent);
```

## Storage Optimizations
1. **Model dedup**: Model names stored once in `token_models`, `token_usage` uses `model_id` FK (4-byte integer vs ~20-byte string per row)
2. **INTEGER timestamps**: Unix epoch integer instead of TEXT "HH:MM:SS" — 4 bytes vs 8 bytes, and enables efficient range queries
3. **agent field**: TEXT, identifies which agent generated the token usage

## Migration
On first run, `_init_token_data()` scans all agent directories for `sessions.db` files, reads old `token_usage` table, and inserts into the new `token.db`. Old records get `agent = <agent_dir_name>`.

## .gitignore
`agents/token.db*` is added to `.gitignore` — this is runtime data, not source code.

## API Queries
- Per-model stats: `SELECT m.name, SUM(t.total_tokens) FROM token_usage t JOIN token_models m ON t.model_id = m.id GROUP BY m.name`
- Per-date stats: `SELECT DATE(t.ts, 'unixepoch') as d, SUM(t.total_tokens) FROM token_usage t GROUP BY d`
- Per-hour stats: `SELECT CAST(strftime('%H', t.ts, 'unixepoch') AS INTEGER) as h, SUM(t.total_tokens) FROM token_usage t GROUP BY h`
- Per-agent stats: `SELECT t.agent, SUM(t.total_tokens) FROM token_usage t GROUP BY t.agent`
