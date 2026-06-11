"""
Budget Config — configurable limits for tool result sizes.

Overridable per-tool. Single source of truth for result size limits.
"""

from dataclasses import dataclass, field
from typing import Dict

# Tools whose thresholds must never be overridden.
PINNED_THRESHOLDS: Dict[str, float] = {
    "read_file": float("inf"),  # No limit — pagination handles large files
}

# Defaults
DEFAULT_RESULT_SIZE_CHARS: int = 100_000
DEFAULT_PREVIEW_SIZE_CHARS: int = 1_500


@dataclass(frozen=True)
class BudgetConfig:
    """Immutable budget constants for tool result size limits."""

    default_result_size: int = DEFAULT_RESULT_SIZE_CHARS
    preview_size: int = DEFAULT_PREVIEW_SIZE_CHARS
    tool_overrides: Dict[str, int] = field(default_factory=dict)

    def resolve_threshold(self, tool_name: str) -> int | float:
        """Resolve the size limit for a tool.

        Priority: pinned -> tool_overrides -> default.
        """
        if tool_name in PINNED_THRESHOLDS:
            return PINNED_THRESHOLDS[tool_name]
        if tool_name in self.tool_overrides:
            return self.tool_overrides[tool_name]
        return self.default_result_size


# Default config
DEFAULT_BUDGET = BudgetConfig()
