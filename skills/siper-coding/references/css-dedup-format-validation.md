# CSS 去重/删除后的格式验证（v0.9.80+）

## 问题描述

使用脚本（如 `dedup_v3.py`）批量删除 CSS 重复块时，可能把块之间的换行一起删掉，导致多个规则被压缩到一行：

```css
/* 修复前（正常）}
.msg-body { ... }

/* 修复后（异常 — 换行被吃掉）
}/* ===== Markdown Rendered Content ===== */.msg-body { min-width: 0; ... }.msg-body .md-para { ... }
```

## 验证 Checklist

修复后必须执行以下验证：

### 1. 大括号匹配
```bash
python3 -c "
css = open('webui/static/style.css').read()
o = css.count('{')
c = css.count('}')
print(f'opens: {o}, closes: {c}, diff: {o-c}')
assert o == c, 'BRACE MISMATCH!'
"
```

### 2. 格式完整性（检测 `}/*` 连在一起）
```bash
python3 -c "
import re
css = open('webui/static/style.css').read()
bad = re.findall(r'\}[^/]{0,5}/\*\*', css)
print(f'格式问题数量: {len(bad)}')
for p in bad[:10]:
    print(repr(p))
assert len(bad) == 0, 'FORMAT ISSUE FOUND!'
"
```

### 3. 关键选择器保留
```bash
for sel in '.sidebar' '.sidebar-header' '.nav-item' '.msg-body' '.msg-body .md-heading' '.msg-body .md-h1' '.msg-body .md-table' '.msg-body .md-hr' '.attach-btn' '.chat-image' '.file-preview-item' '.card-title' '.tool-step-name' '.prompt-modal' '.toast' '.typing' '.status-dot'; do
  count=$(grep -c "$sel" webui/static/style.css)
  echo "$count $sel"
done
```

### 4. 行数和文件大小对比
```bash
wc -l webui/static/style.css
wc -c webui/static/style.css
```

## 修复方法

如果发现格式问题（规则被压缩到一行），用 `patch` 手动修复：

关键：old_string 必须精确匹配被压缩的那一行，new_string 中每个规则独立一行。

## 预防措施

去重脚本应该在删除块时保留块前后的换行符。如果脚本做不到这一点，去重后必须手动运行格式验证。
