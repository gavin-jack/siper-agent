# i18n Missing Key Audit — 语言包缺失 Key 审计方法

## 问题现象

用户看到页面上显示的是 key 本身（如 `sessions.refreshed`、`chat.copied`）而不是中文/英文翻译。

根因：`t('some.key')` 在 `LANG[currentLang]` 中找不到对应 key 时，回退到 key 本身字符串。

## 审计步骤

### 1. 提取所有 t() 调用

```python
import re, os

js_dir = '/home/gavin/.siper/webui/static'
all_t_calls = set()
for root, dirs, files in os.walk(js_dir):
    for f in files:
        if not f.endswith('.js'):
            continue
        path = os.path.join(root, f)
        with open(path) as fh:
            content = fh.read()
        matches = re.findall(r'''t\(['"]([a-zA-Z][a-zA-Z0-9_.]+)['"]\)''', content)
        for m in matches:
            all_t_calls.add(m)
```

### 2. 提取所有 LANG key

```python
# 只检查 core.js（app.js 是死代码，不被 index.html 加载）
with open('/home/gavin/.siper/webui/static/pages/core.js') as f:
    core_content = f.read()
lang_keys = set(re.findall(r"'([a-zA-Z][a-zA-Z0-9_.]+)':\s*'[^']*'", core_content))
```

### 3. 对比缺失

```python
html_tags = {'blockquote', 'br', 'button', 'code', 'div', 'hr', 'input', 'li', 'ol', 
             'option', 'pre', 'span', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul'}
missing = sorted((all_t_calls - lang_keys) - html_tags)
```

### 4. 修复

在 core.js 的 zh/en/tw 三套语言包中同步添加缺失 key。

**关键规则：**
- 只改 core.js（app.js 是死代码，改了不影响运行时）
- 三套语言包必须同步添加
- zh = 简体中文, en = English, tw = 繁體中文
- 添加位置：在各语言包的 toast 区域之后（zh 约 406 行，en 约 813 行，tw 约 1220 行）

## 历史案例（v0.9.81）

16 个缺失 key 被添加到三套语言包：

| key | zh | en | tw |
|-----|----|----|-----|
| sessions.refreshed | 会话已刷新 | Sessions refreshed | 會話已刷新 |
| sessions.refreshFailed | 会话刷新失败 | Sessions refresh failed | 會話刷新失敗 |
| logs.refreshed | 日志已刷新 | Logs refreshed | 日誌已刷新 |
| memory.refreshed | 记忆已刷新 | Memory refreshed | 記憶已刷新 |
| settings.refreshed | 设置已刷新 | Settings refreshed | 設置已刷新 |
| settings.refreshFailed | 设置刷新失败 | Settings refresh failed | 設置刷新失敗 |
| settings.modelSaved | 模型已保存 | Model saved | 模型已儲存 |
| skills.refreshed | 技能已刷新 | Skills refreshed | 技能已刷新 |
| tasks.refreshed | 任务已刷新 | Tasks refreshed | 任務已刷新 |
| token.refreshed | Token 用量已刷新 | Token usage refreshed | Token 用量已刷新 |
| token.refreshFailed | Token 刷新失败 | Token refresh failed | Token 刷新失敗 |
| agent.selectConfigAgent | 选择智能体... | Select Agent... | 選擇智能體... |
| chat.copied | 消息已复制 | Message copied | 訊息已複製 |
| chat.copyFailed | 复制失败 | Copy failed | 複製失敗 |
| chat.noModels | 暂无可用模型 | No models available | 暫無可用模型 |
| token.modelStats | 模型统计 | Model Stats | 模型统计 |

## v20260803k 案例

`token.modelStats` — HTML 中 `<div class="card-title" data-i18n="token.modelStats">模型统计</div>` 有 data-i18n 属性但 LANG 中无对应 key。中文模式显示 HTML 默认值（正常），英文模式显示 key 本身 `token.modelStats`（异常）。修复：在 zh/en/tw 三套语言包中同步添加。

## 预防措施

添加新的 `t('xxx.yyy')` 调用时，必须在 core.js 的 zh/en/tw 三套语言包中同步添加对应 key。
验证方法：`grep -n "xxx.yyy" core.js` 确认三语都存在。
