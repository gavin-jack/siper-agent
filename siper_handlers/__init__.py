"""SiPer backend handler modules — extracted from siper_web.py main()."""

from siper_handlers.tools import (
    _detect_provider,
    _estimate_context_window,
    api_discover_models,
)

from siper_handlers.theme_handlers import (
    api_theme_list_templates,
    api_theme_save,
    api_theme_load,
    api_theme_delete,
    api_theme_export,
    api_theme_import,
)

__all__ = [
    "_detect_provider",
    "_estimate_context_window",
    "api_discover_models",
    "api_theme_list_templates",
    "api_theme_save",
    "api_theme_load",
    "api_theme_delete",
    "api_theme_export",
    "api_theme_import",
]
