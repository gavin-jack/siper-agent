"""A-class theme handlers — extracted from siper_web.py main().

These functions handle theme template CRUD operations.
"""

import json
import logging
import time
from pathlib import Path
import re as _re

logger = logging.getLogger("siper_web.handlers.theme")


def _themes_dir():
    """Path to user themes directory."""
    d = Path.home() / ".siper" / "data" / "themes"
    d.mkdir(parents=True, exist_ok=True)
    return d


def api_theme_list_templates():
    themes_dir = _themes_dir()
    templates = []
    for f in sorted(themes_dir.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            vars_count = len(data.get("vars", {}))
            templates.append({
                "name": data.get("name", f.stem),
                "created_at": data.get("created_at", ""),
                "vars_count": vars_count,
            })
        except Exception:
            pass
    return {"templates": templates}


def api_theme_save(body):
    try:
        name = body.get("name", "").strip()
        if not name:
            return {"success": False, "error": "模板名称不能为空"}
        vars_obj = body.get("vars", {})
        sizes_obj = body.get("sizes", {})
        themes_dir = _themes_dir()
        safe_name = _re.sub(r'[^\w\-.]', '_', name)
        fpath = themes_dir / f"{safe_name}.json"
        record = {
            "name": name,
            "vars": vars_obj,
            "sizes": sizes_obj,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        fpath.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info(f"主题已保存：{name} ({fpath})")
        return {"success": True, "name": name}
    except Exception as e:
        logger.error(f"主题保存错误：{e}")
        return {"success": False, "error": str(e)}


def api_theme_load(full_path):
    try:
        from urllib.parse import urlparse, parse_qs
        query = parse_qs(urlparse(full_path).query) if "?" in full_path else {}
        name = query.get("name", [""])[0].strip()
        if not name:
            return {"success": False, "error": "缺少 name 参数"}
        themes_dir = _themes_dir()
        safe_name = _re.sub(r'[^\w\-.]', '_', name)
        fpath = themes_dir / f"{safe_name}.json"
        if not fpath.exists():
            return {"success": False, "error": f"模板 '{name}' 不存在"}
        data = json.loads(fpath.read_text(encoding="utf-8"))
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"主题加载错误：{e}")
        return {"success": False, "error": str(e)}


def api_theme_delete(body):
    try:
        name = body.get("name", "").strip()
        if not name:
            return {"success": False, "error": "缺少 name 参数"}
        themes_dir = _themes_dir()
        safe_name = _re.sub(r'[^\w\-.]', '_', name)
        fpath = themes_dir / f"{safe_name}.json"
        if not fpath.exists():
            return {"success": False, "error": f"模板 '{name}' 不存在"}
        fpath.unlink()
        logger.info(f"主题已删除：{name}")
        return {"success": True}
    except Exception as e:
        logger.error(f"主题删除错误：{e}")
        return {"success": False, "error": str(e)}


def api_theme_export():
    """Export current runtime config as theme data (default CSS vars placeholder)."""
    return {"vars": {}, "sizes": {}}


def api_theme_import(body):
    """Import theme data by saving it as a new template."""
    return api_theme_save(body)
