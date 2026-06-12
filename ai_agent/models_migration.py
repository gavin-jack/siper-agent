"""
一次性迁移：models.json → models.db

用法:
    python3 -c "from ai_agent.models_migration import migrate; migrate()"
    # 或
    python3 ai_agent/models_migration.py
"""
import json
import sys
import time
from pathlib import Path


def migrate(json_path: str = None, db_path: str = None):
    """从 models.json 迁移到 models.db"""
    project_root = Path(__file__).resolve().parent.parent

    if json_path is None:
        json_path = str(project_root / "models.json")
    if db_path is None:
        db_path = str(project_root / "agents" / "default" / "models.db")

    from ai_agent.models_db import ModelsDB

    # 读取 JSON
    json_file = Path(json_path)
    if not json_file.exists():
        print(f"❌ {json_path} 不存在，跳过迁移")
        return False

    data = json.loads(json_file.read_text(encoding="utf-8"))
    db = ModelsDB(db_path)

    providers = data.get("providers", {})
    default_model = data.get("default_model", "")
    default_provider = data.get("default_provider", "")

    migrated = 0
    for prov_name, prov_cfg in providers.items():
        pid = prov_name or "custom"
        db.upsert_provider(pid, prov_cfg.get("base_url", ""), prov_cfg.get("api_key", ""))

        for m in prov_cfg.get("models", []):
            mid = m.get("id") or m.get("name", "")
            if not mid:
                continue

            caps = m.get("capabilities", [])
            mname = m.get("name") or m.get("id", "")
            is_default = 1 if mname == default_model else 0

            db.upsert_model(
                provider_id=pid,
                model_id=mid,
                name=mname,
                alias=m.get("alias", ""),
                base_url=m.get("base_url", "") or prov_cfg.get("base_url", ""),
                api_key=m.get("api_key", "") or prov_cfg.get("api_key", ""),
                context_window=m.get("context_window", 8192),
                capabilities=caps,
                is_default=is_default,
                ttft=m.get("ttft"),
                streaming=m.get("streaming"),
                context_window_tested=m.get("context_window_tested"),
                json_mode=m.get("json_mode"),
            )
            migrated += 1

    db.set_global_setting("default_model", default_model)
    db.set_global_setting("default_provider", default_provider)

    print(f"✅ 迁移完成: {migrated} 个模型, {len(providers)} 个 provider")

    # 验证
    flat = db.get_models_flat()
    print(f"   验证: {len(flat['models'])} 个模型, default={flat['default_model']}")

    # 对比 capabilities 保留情况
    for m in flat["models"]:
        if m["capabilities"]:
            print(f"   {m['name']}: {m['capabilities']}")

    return True


if __name__ == "__main__":
    migrate()
