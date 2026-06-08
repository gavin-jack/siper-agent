# Git 仓库状态异常处理

## 现象

`/home/gavin/.siper/` 目录下的 `.git` 目录可能丢失（系统重装/WSL2 重建/误删等），导致 `git status` / `git commit` 报错 "不是 git 仓库"。

## 诊断

```bash
ls -la /home/gavin/.siper/.git 2>/dev/null && echo "git OK" || echo "NO git repo"
```

## 修复

```bash
cd /home/gavin/.siper
git init
git config user.name "Gavin"
git config user.email "gavin@local"
git add -A
git commit -m "v0.X.X: <描述>"
```

**注意**：
- 全新仓库没有历史记录，第一次 commit 会是根提交
- 如果之前有远程仓库（GitHub/Gitee），需重新 `git remote add` 并 force push
- 提交前先 `git status` 确认没有意外的大文件/敏感文件被提交
- 临时文件（`_check_syntax.py`、`_start_siper.sh`）在 commit 前用 `git reset HEAD <file>` 排除

## 版本号同步

重新 init 后，确认以下两处版本号一致：
1. `siper_web.py` 中的 `SIPER_VERSION = "vX.X.X"`
2. `webui/templates/index.html` 中的 `<span class="sidebar-version" id="sidebarVersion">vX.X.X</span>`

HTML 中的版本号是硬编码占位符（`v0.0.0`），启动后会被 JS 从 `/api/version` 接口获取的动态值替换。但占位符也应手动更新为当前版本，避免首次加载闪烁显示旧版本号。

## 关联

- `changelog-patching.md` — 版本号和 CHANGELOG 维护规则
