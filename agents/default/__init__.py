"""Default agent configuration package."""

from pathlib import Path

AGENT_DIR = Path(__file__).parent
SOUL_FILE = AGENT_DIR / "soul.md"
CONFIG_FILE = AGENT_DIR / "agent.md"


def load_soul() -> str:
    """Load the soul.md content defining agent personality."""
    if SOUL_FILE.exists():
        return SOUL_FILE.read_text(encoding="utf-8")
    return ""


def load_config() -> str:
    """Load the agent.md content defining agent behavior rules."""
    if CONFIG_FILE.exists():
        return CONFIG_FILE.read_text(encoding="utf-8")
    return ""
