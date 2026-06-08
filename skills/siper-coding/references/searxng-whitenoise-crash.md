# SearXNG 诊断与修复完整指南

## 症状
- `systemctl status searxng-uwsgi.service` 显示 `activating (auto-restart)` + exit code 22
- SearXNG 搜索返回 0 结果或全部引擎超时

## 根因链（按排查顺序）

### 问题 1：static_path 为空 → whitenoise 崩溃

```
/etc/searxng/settings.yml 中 static_path: ''
  → pathlib.Path('') 解析为当前工作目录
  → whitenoise 初始化时扫描整个 Python 包目录树
  → 扫描 __pycache__、.pyc 等大量文件
  → 扫描时间过长，被 KeyboardInterrupt 中断
  → uWSGI worker 加载失败，exit code 22
  → systemd 不断重启，形成循环
```

**日志特征**：`journalctl` 显示 `KeyboardInterrupt` 在 `whitenoise/base.py:scantree`

### 问题 2：SQLite 数据库权限/锁

```
SearXNG 以 searxng 用户运行
  → SQLite 数据库文件属于 www-data（或混合所有权）
  → searxng 用户只有读权限（644）
  → sqlite3.OperationalError: attempt to write a readonly database
  → 或 database is locked（WAL 模式 + 多 worker 并发写入）
```

**日志特征**：`sqlite3.OperationalError: attempt to write a readonly database` 或 `database is locked`

**数据库位置**：`/tmp/sxng_cache_DATA_CACHE.db`、`/tmp/sxng_cache_ENGINES_CACHE.db`

**⚠️ WAL 文件陷阱（v0.9.69+）**：不仅 `.db` 文件本身需要正确所有权，WAL（Write-Ahead Log）文件（`.db-wal`、`.db-shm`）也必须属于同一用户。如果 WAL 文件由其他用户（如 gavin）创建（例如通过 test client 测试过），SearXNG 以 searxng 用户运行时无法写入 WAL 文件，导致 `readonly database` 错误。

```bash
# 修复所有相关文件
sudo chown searxng:searxng /tmp/sxng_cache_DATA_CACHE.db*
sudo chown searxng:searxng /tmp/sxng_cache_ENGINES_CACHE.db*
```

### 问题 3：全部引擎超时

```
SearXNG 配置了太多国外引擎（Google、DuckDuckGo 等）
  → 国内网络环境下这些引擎不可达
  → 每个引擎超时 10s
  → 所有引擎超时后 SearXNG 才返回结果
  → 总耗时 > 10s，前端显示 0 结果
```

**日志特征**：大量 `httpx.TimeoutException`、`engine timeout`

**验证方法**：用 SearXNG 的 Flask test client 直接测试（不经过 uWSGI），可以确认是引擎问题还是 uWSGI 问题：
```bash
/usr/local/searxng/searx-pyenv/bin/python3 << 'PYEOF'
import os
os.environ['SEARXNG_SETTINGS_PATH'] = '/etc/searxng/settings.yml'
import logging
logging.getLogger('searx').setLevel(logging.ERROR)
from searx import webapp, settings
print(f"Enabled engines: {len([e for e in settings['engines'] if not e.get('disabled', False)])}")
client = webapp.app.test_client()
import time
start = time.time()
response = client.get('/search?q=Python&format=json&language=zh-CN')
elapsed = time.time() - start
import json
data = json.loads(response.data)
print(f"Response: {response.status_code} ({elapsed:.2f}s)")
print(f"Results: {len(data.get('results', []))}")
print(f"Unresponsive: {len(data.get('unresponsive_engines', []))}")
PYEOF
```

### 问题 4：SearXNG 服务运行 ≠ 搜索正常工作

SearXNG 服务 `active (running)` 只说明 uWSGI master 进程在运行。搜索功能可能因为以下原因不工作：
1. 引擎全部超时（国外引擎被墙）
2. SQLite 数据库锁/只读（WAL 文件权限问题）
3. 引擎 cookie 缓存失效

**正确验证方式**：不仅检查服务状态，还要实际发起搜索请求并检查结果数量。

## 诊断步骤

```bash
# 1. 确认服务状态
systemctl status searxng-uwsgi.service

# 2. 查看崩溃日志
journalctl -u searxng-uwsgi.service -n 30 --no-pager

# 3. 确认 static_path 配置
grep static_path /etc/searxng/settings.yml
# 如果输出 "static_path: ''" 即为问题 1

# 4. 检查 SQLite 数据库权限
ls -la /tmp/sxng_cache_*.db*
stat -c "%a %U %G" /tmp/sxng_cache_DATA_CACHE.db

# 5. 测试 SearXNG 搜索
curl -s --max-time 15 "http://127.0.0.1:8888/search?q=test&format=json" -o /tmp/searxng_test.json
python3 -c "import json; d=json.load(open('/tmp/searxng_test.json')); print(len(d.get('results',[])), 'results'); print('unresponsive:', d.get('unresponsive_engines',[]))"

# 6. 测试外网连通性（排除网络问题）
curl -s -o /dev/null -w "baidu: %{http_code} - %{time_total}s\n" https://www.baidu.com
curl -s -o /dev/null -w "bing: %{http_code} - %{time_total}s\n" https://cn.bing.com
```

## 修复方法

**全部需要 sudo 权限。** 如果没有免密 sudo，需用户在终端手动执行。

### 修复 1：static_path

```bash
sudo sed -i "s|  static_path: ''|  static_path: '/usr/local/searxng/searx-pyenv/lib/python3.12/site-packages/searx/static'|" /etc/searxng/settings.yml
```

### 修复 2：去掉 lazy-apps + 减少 worker

```bash
# 去掉 lazy-apps（让主进程加载 app，worker fork 继承）
sudo sed -i 's/^lazy-apps = true$/# lazy-apps = true  # disabled: causes whitenoise scan per worker/' /etc/uwsgi/apps-available/searxng.ini

# 减少 worker 数量（缓解 SQLite WAL 并发锁）
sudo sed -i 's/^processes = 4$/processes = 1/' /etc/uwsgi/apps-available/searxng.ini
```

### 修复 3：SQLite 数据库权限

```bash
# 修复所有权
sudo chown searxng:searxng /tmp/sxng_cache_DATA_CACHE.db /tmp/sxng_cache_DATA_CACHE.db-wal /tmp/sxng_cache_DATA_CACHE.db-shm /tmp/sxng_cache_ENGINES_CACHE.db 2>/dev/null

# 如果数据库损坏，删除重建
sudo rm -f /tmp/sxng_cache_*.db*
```

### 修复 4：禁用国外引擎（减少超时）

```bash
# 用 Python 脚本批量禁用（白名单模式）
sudo python3 << 'PYEOF'
import yaml
with open('/etc/searxng/settings.yml') as f:
    config = yaml.safe_load(f)
china_friendly = {
    '360search', '360search videos', 'bing', 'bing images', 'bing news', 'bing videos',
    'baidu images', 'baidu kaifa', 'bilibili', 'chinaso news', 'chinaso images', 'chinaso videos',
    'sogou images', 'sogou videos', 'sogou wechat', 'quark images', 'marginalia',
    'currency', 'wikidata', 'wiktionary', 'wikimini', 'openstreetmap', 'wolframalpha',
    'wolframalpha_api', 'dictzone', 'mymemory translated',
    'npm', 'pypi', 'packagist', 'rubygems', 'pub.dev', 'pkg.go.dev', 'metacpan',
    'github code', 'codeberg', 'gitea.com', 'gitlab', 'bitbucket', 'docker hub',
    'arxiv', 'openalex', 'crossref', 'core.ac.uk', 'national vulnerability database',
    'openmeteo', 'wttr.in', 'radio browser', 'fdroid',
    'arch linux wiki', 'nixos wiki', 'gentoo', 'voidlinux', 'cachy os packages',
    'devicons', 'lucide', 'selfhst icons', 'svgrepo', 'emojipedia', 'tineye', 'etymonline',
    'genius', 'acfun', 'iqiyi',
}
disabled = 0
for engine in config.get('engines', []):
    name = engine.get('name', '')
    if name not in china_friendly and not engine.get('disabled', False):
        engine['disabled'] = True
        disabled += 1
with open('/etc/searxng/settings.yml', 'w') as f:
    yaml.dump(config, f, default_flow_style=False, allow_unicode=True)
print(f'Disabled {disabled} engines')
PYEOF
```

### 修复 5：重启并验证

```bash
sudo systemctl restart searxng-uwsgi.service
sleep 3
systemctl status searxng-uwsgi.service
ss -tlnp | grep 8888
```

## 环境约束

- `/etc/searxng/settings.yml` 属于 `searxng:searxng`，权限 644
- `/etc/uwsgi/apps-available/searxng.ini` 属于 `root:root`，权限 644
- 无免密 sudo 时无法直接修改，需用户提供密码或手动执行
- `searxng` 用户的 shell 是 python，无法 `su searxng`
- `gavin` 用户在 sudo 组但需要密码

## 无 sudo 时的系统权限调试方法

当无法获得 sudo 权限时，按以下顺序排查：

1. **检查文件所有权**：`ls -la <file>` / `stat -c "%U %G %a" <file>`
2. **检查目录写权限**：`ls -ld <dir>`（需要目录 owner 或 group write）
3. **检查 ACL**：`getfacl <file>`
4. **检查 AppArmor**：`aa-status` / `cat /etc/apparmor.d/<profile>`
5. **检查 capabilities**：`getcap <binary>`
6. **检查 sudoers**：`cat /etc/sudoers.d/*` / `groups`（确认用户在 sudo 组）

如果所有路径都被封锁，只能请求用户在终端手动执行命令。

## 替代方案（无需 sudo）

如果无法获得 sudo 权限，SearXNG 不是必须的——搜索工具已通过 Bing China fallback 正常工作：
- 优先级：SearXNG → **Bing China** → DuckDuckGo
- SearXNG 失败时自动 fallback 到 Bing
- 详见 `references/web-search-tool-fallback-chain.md`

## 技术细节

### 为什么 `static_path: ''` 会导致扫描整个目录

`webutils.py:get_static_file_list()` 中：
```python
static_path = pathlib.Path(str(get_setting("ui.static_path")))
# 当值为 '' 时，Path('') 解析为 Path('.')，即当前工作目录
```

uWSGI 配置的 `chdir` 是 `/usr/local/searxng/searx-pyenv/lib/python3.12/site-packages/searx`，所以 `Path('.')` 就是这个目录，whitenoise 会递归遍历整个包。

### 为什么 `lazy-apps = true` 加剧问题

- `lazy-apps = true`：每个 worker 独立加载 app，每个都触发 whitenoise 全量扫描
- 去掉后：主进程加载一次 app，worker 通过 fork 继承，不再重复扫描
- 配合 `need-app = true`：主进程加载失败时整个实例退出，不会启动空 worker

### SearXNG 引擎超时根因

SearXNG 默认启用 50+ 个搜索引擎，其中很多在国内不可用：
- Google、DuckDuckGo、Startpage 等被墙
- 每个引擎超时 10s，所有引擎串行/并行搜索
- 即使国内引擎（百度、Bing、360）能正常工作，也要等所有引擎超时后才返回
- 解决方案：禁用不可用引擎（需要修改 settings.yml，需 sudo）

## 修改历史

| 日期 | 变更 |
|---|---|
| 2026-05-22 | 首次诊断：static_path 为空导致 whitenoise 扫描整个包目录 |
| 2026-05-22 | 补充：SQLite 数据库权限/锁问题、全部引擎超时问题、完整修复方案 |
| 2026-05-22 | 补充：ENGINES_CACHE.db WAL 文件所有权陷阱、Flask test client 验证方法、无 sudo 调试步骤、服务运行≠搜索正常 |