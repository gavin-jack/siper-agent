#!/usr/bin/env python3
"""
SiPer Agent deployment packager.
Produces a clean tar.gz with:
- No .git, __pycache__, .pyc
- No .env (contains API keys)
- No sessions.db, token.db (conversation / usage history)
- No meta.json, todos.json, skill_stats.json (runtime generated)
- No uploads/, data/, .tmp/, tmp/, .cleanup_backup/
- No Zone.Identifier (Windows ADS)
- No skills/siper-coding/references or scripts (dev-only)
- No webui/static/node_modules
- Template files (.template) provided for all configs
"""

import os
import sys
import shutil
import tarfile
import tempfile
import argparse
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROJECT_NAME = "siper-agent"
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
# Default output: E:\SiPer\release\ (create_deploy.py output)
# Override with --output flag
DEFAULT_OUTPUT = Path("/mnt/e/SiPer/release")

# Directory names to exclude at any level
EXCLUDE_DIRS = {
    ".git",
    "__pycache__",
    "node_modules",
    ".tmp",
    "tmp",
    "uploads",
    "data",
    ".cleanup_backup",
    "backup",
    "references",
    "scripts",
}

# File names to exclude
EXCLUDE_FILES = {
    ".env",
    ".siper.pid",
    ".gitignore",
    "test_siper.py",
    "settings.json",
    "sessions.db",
    "sessions.db-shm",
    "sessions.db-wal",
    "token.db",
    "token.db-shm",
    "token.db-wal",
    "meta.json",
    "todos.json",
    "skill_stats.json",
    "config.json.bak",
    "soul.md.bak",
    "SKILL.md",
    "package.json",
    "package-lock.json",
    ".package-lock.json",
    "memory.md",
    "memory.json",
    "config.json",
    "skill_config.json",
    "outbox.json",
}

EXCLUDE_EXTENSIONS = {".pyc", ".tar.gz"}

EXCLUDE_PATTERNS = [
    ":Zone.Identifier",
    "/memory/",
]


def should_exclude(path: Path, rel_path: str) -> bool:
    parts = Path(rel_path).parts
    for part in parts:
        if part in EXCLUDE_DIRS:
            return True
    if path.name in EXCLUDE_FILES:
        return True
    if path.suffix in EXCLUDE_EXTENSIONS:
        return True
    for pattern in EXCLUDE_PATTERNS:
        if pattern in rel_path:
            return True
    return False


def collect_files(src: Path, dst: Path) -> int:
    copied = 0
    for item in sorted(src.iterdir()):
        rel = str(item.relative_to(src))
        if should_exclude(item, rel):
            continue
        if item.is_dir():
            new_dir = dst / item.name
            new_dir.mkdir(parents=True, exist_ok=True)
            copied += collect_files(item, new_dir)
        elif item.is_file():
            shutil.copy2(item, dst / item.name)
            copied += 1
    return copied


TEMPLATE_SETTINGS = """\
{
  "agent": {
    "id": "primary",
    "name": "AI Agent",
    "max_concurrent_tools": 5,
    "fallback_providers": [],
    "memory_backend": "sqlite",
    "session_timeout": 3600,
    "enable_logging": true,
    "log_level": "INFO",
    "skills_dir": "./skills",
    "data_dir": "./data"
  },
  "system": {
    "log_buffer_size": 2000,
    "token_usage_max": 500,
    "session_list_limit": 50,
    "ws_heartbeat_timeout": 300,
    "context_window_default": 8192
  },
  "tools": {
    "rate_limit": {
      "requests_per_minute": 60,
      "requests_per_hour": 1000,
      "burst_size": 10
    }
  },
  "gateway": {
    "cli": { "enabled": true },
    "webui": { "enabled": true, "host": "localhost", "port": 9724 }
  },
  "orchestration": {
    "default_workers": 2,
    "task_timeout": 300
  }
}
"""

TEMPLATE_ENV = """\
# SiPer Agent environment config
# Copy to .env and fill in real API key
# Example: OPENAI_API_KEY=sk-xxx
# Or set via your LLM provider's environment variable
"""

TEMPLATE_AGENT_CONFIG = """\
{
  "name": "default",
  "icon": "🎭",
  "avatar": "agents/default/avatar.png",
  "tags": ["default"],
  "memory_integration": {
    "mode": "append",
    "position": "after_system",
    "max_tokens": 20000
  },
  "appearance": {
    "msg_font_size": "18px",
    "msg_bg": "#1c2333",
    "msg_text": "#e6edf3",
    "msg_border": "#30363d"
  },
  "session_timeout": 3600,
  "max_tools": 300,
  "max_tool_rounds": 100,
  "available_models": ["your-model-id"],
  "default_chat_model": "your-model-id",
  "default_vision_model": "your-model-id"
}
"""

TEMPLATE_SKILL_CONFIG = """\
{
  "version": 1,
  "pre_filter": {
    "enabled": true,
    "top_k": 10,
    "min_score": 0.1,
    "fallback_threshold": 3
  },
  "injection": {
    "format": "text",
    "include_capabilities": true,
    "max_skill_index_tokens": 1000
  },
  "feedback": {
    "enabled": true,
    "stats_file": "skill_stats.json",
    "decay_factor": 0.95,
    "min_samples": 5
  },
  "gating": {
    "check_tools": true,
    "check_env": false,
    "check_bins": false,
    "check_platform": false
  },
  "entries": {}
}
"""

TEMPLATE_COMPANY_CONFIG = """\
{
  "name": "company-researcher",
  "icon": "🔍",
  "tags": ["researcher"],
  "available_models": ["your-model-id"],
  "default_chat_model": "your-model-id"
}
"""

INSTALL_MD = """\
# SiPer Agent Installation Guide

## Quick Start

1. Extract the archive
   ```bash
   tar xzf siper-agent-*.tar.gz
   cd siper-agent
   ```

2. Install dependencies
   ```bash
   pip3 install -r requirements.txt
   ```

3. Configure (copy templates and edit)
   ```bash
   cp .env.template .env
   cp settings.json.template settings.json
   cp agents/default/config.json.template agents/default/config.json
   cp agents/default/skill_config.json.template agents/default/skill_config.json
   ```

4. Start the service
   ```bash
   nohup python3 siper_web.py > /dev/null 2>&1 &
   ```

5. Open http://localhost:9724

## Config Files

| File | Purpose |
|------|---------|
|| `.env` | API Key |
| `settings.json` | System parameters |
| `agents/default/config.json` | Agent config |
| `agents/default/skill_config.json` | Skill config |

## Dependencies

- Python 3.10+
- Required: openai, websockets, jinja2
- Optional: httpx, edge-tts
"""


def create_templates(dst: Path):
    (dst / "settings.json.template").write_text(TEMPLATE_SETTINGS)
    (dst / ".env.template").write_text(TEMPLATE_ENV)

    agents_default = dst / "agents" / "default"
    agents_default.mkdir(parents=True, exist_ok=True)
    (agents_default / "config.json.template").write_text(TEMPLATE_AGENT_CONFIG)
    (agents_default / "skill_config.json.template").write_text(TEMPLATE_SKILL_CONFIG)

    company = dst / "agents" / "company-researcher"
    company.mkdir(parents=True, exist_ok=True)
    (company / "config.json.template").write_text(TEMPLATE_COMPANY_CONFIG)

    (dst / "INSTALL.md").write_text(INSTALL_MD)


def main():
    parser = argparse.ArgumentParser(description="SiPer Agent deployment packager")
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output directory (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--name",
        type=str,
        default=PROJECT_NAME,
        help=f"Package name (default: {PROJECT_NAME})",
    )
    args = parser.parse_args()

    archive_path = args.output / f"{args.name}-{TIMESTAMP}.tar.gz"

    print(f"=== SiPer Agent Packaging ===")
    print(f"Source: {PROJECT_ROOT}")
    print(f"Output: {archive_path}")
    print()

    args.output.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="siper-dist-") as tmpdir:
        dist_dir = Path(tmpdir) / PROJECT_NAME

        print("[1/4] Copying source files...")
        dist_dir.mkdir()
        count = collect_files(PROJECT_ROOT, dist_dir)
        print(f"        Copied {count} files")

        print("[2/4] Generating config templates...")
        create_templates(dist_dir)

        # Remove empty directories
        print("[2.5/4] Cleaning up empty directories...")
        for root, dirs, files in os.walk(str(dist_dir), topdown=False):
            for d in dirs:
                dirpath = Path(root) / d
                try:
                    if not any(dirpath.iterdir()):
                        dirpath.rmdir()
                except OSError:
                    pass

        print("[3/4] Creating tar.gz archive...")
        with tarfile.open(archive_path, "w:gz") as tar:
            tar.add(dist_dir, arcname=PROJECT_NAME)

        print("[4/4] Verifying archive...")
        with tarfile.open(archive_path, "r:gz") as tar:
            members = tar.getnames()
            file_count = sum(1 for m in members if not m.endswith("/"))

            sensitive_patterns = [
                ".env", "sessions.db",
                "token.db", "settings.json"
            ]
            leaked = []
            for m in members:
                basename = m.split("/")[-1]
                for pat in sensitive_patterns:
                    if basename == pat:
                        leaked.append(m)

            if leaked:
                print(f"        WARNING: sensitive files found: {leaked}")
            else:
                print("        OK - no sensitive files leaked")

    size_mb = archive_path.stat().st_size / (1024 * 1024)
    print()
    print(f"=== Done ===")
    print(f"Archive: {archive_path}")
    print(f"Size:    {size_mb:.1f} MB")
    print(f"Files:   {file_count}")
    print()

    print("Top-level structure:")
    with tarfile.open(archive_path, "r:gz") as tar:
        seen = set()
        for m in sorted(members):
            top = m.split("/")[0] if "/" in m else m
            if top not in seen:
                seen.add(top)
                print(f"  {top}/")


if __name__ == "__main__":
    main()
