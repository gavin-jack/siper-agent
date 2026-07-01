"""
数据库管理器 — 统一连接管理

单例模式，每个数据库名只维护一个连接。
线程安全：check_same_thread=False（SQLite WAL 模式）。
"""
import sqlite3
from pathlib import Path
from typing import Dict


class DatabaseManager:
    def __init__(self, root: Path):
        self._root = root
        self._conns: Dict[str, sqlite3.Connection] = {}

    def conn(self, name: str) -> sqlite3.Connection:
        """获取数据库连接（单例）"""
        if name not in self._conns:
            path = self._path(name)
            path.parent.mkdir(parents=True, exist_ok=True)
            c = sqlite3.connect(str(path), check_same_thread=False)
            c.execute("PRAGMA journal_mode=WAL")
            c.execute("PRAGMA cache_size=-8000")  # 8MB 缓存
            c.row_factory = sqlite3.Row
            self._conns[name] = c
        return self._conns[name]

    def _path(self, name: str) -> Path:
        mapping = {
            "sessions": self._root / "agents" / "default" / "sessions" / "sessions.db",
            "models": self._root / "data" / "models.db",
            "token": self._root / "data" / "token.db",
        }
        return mapping.get(name, self._root / f"{name}.db")

    def close_all(self):
        """关闭所有连接"""
        for conn in self._conns.values():
            try:
                conn.close()
            except Exception:
                pass
        self._conns.clear()
