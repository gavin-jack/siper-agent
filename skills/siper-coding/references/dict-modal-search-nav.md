# Dict Modal 搜索导航模式（v0.9.35+）

## 适用场景

在 Dict Modal（完整响应数据查看器）中输入搜索词后，提供搜索结果计数和上下跳转导航。

## UI 布局

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 [搜索 key or value...    ] 3/15  ↑ ↓  │ 复制全部 │ 格式化 │
└─────────────────────────────────────────────────────────────┘
```

搜索框内从左到右：🔍 图标 → 输入框 → 计数 badge → ↑ 按钮 → ↓ 按钮

## 核心实现

### 搜索状态

```javascript
let searchMatches = [];   // <mark class="dict-search-hit"> 元素数组
let searchCurrent = -1;   // 当前匹配索引
const markStyle = 'background:' + C.yellow + ';color:inherit;border-radius:2px;padding:0 2px;font-weight:600;';
const markCurrentStyle = 'background:' + C.orange + ';color:inherit;border-radius:2px;padding:0 2px;font-weight:700;';
```

### 搜索更新函数

```javascript
function updateSearch() {
  const q = searchInput.value.toLowerCase().trim();
  if (!q) {
    // 清空搜索，恢复原始渲染
    searchMatches = [];
    searchCurrent = -1;
    searchCount.style.display = 'none';
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
    pre.innerHTML = '';
    pre.appendChild(renderFormatted(data));
    return;
  }
  // 高亮匹配
  const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const html = renderValue(data, 0);
  pre.innerHTML = html.replace(
    new RegExp('(' + escapedQ + ')', 'gi'),
    '<mark class="dict-search-hit" style="' + markStyle + '">$1</mark>'
  );
  // 收集匹配元素
  searchMatches = Array.from(pre.querySelectorAll('.dict-search-hit'));
  searchCurrent = searchMatches.length > 0 ? 0 : -1;
  // 更新 UI
  if (searchMatches.length > 0) {
    searchCount.textContent = (searchCurrent + 1) + '/' + searchMatches.length;
    searchCount.style.display = '';
    prevBtn.style.display = '';
    nextBtn.style.display = '';
    scrollToMatch(0);
  } else {
    searchCount.textContent = '0/0';
    searchCount.style.display = '';
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
  }
}
```

### 跳转函数

```javascript
function scrollToMatch(idx) {
  if (idx < 0 || idx >= searchMatches.length) return;
  searchCurrent = idx;
  searchCount.textContent = (idx + 1) + '/' + searchMatches.length;
  // 重置所有高亮
  searchMatches.forEach(m => { m.style.cssText = markStyle; });
  // 当前匹配用橙色
  searchMatches[idx].style.cssText = markCurrentStyle;
  // 平滑滚动到可视区域
  searchMatches[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function goNext() {
  if (searchMatches.length === 0) return;
  scrollToMatch((searchCurrent + 1) % searchMatches.length);
}

function goPrev() {
  if (searchMatches.length === 0) return;
  scrollToMatch((searchCurrent - 1 + searchMatches.length) % searchMatches.length);
}
```

### 事件绑定

```javascript
searchInput.addEventListener('input', updateSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) goPrev(); else goNext(); }
  if (e.key === 'Escape') { searchInput.value = ''; updateSearch(); }
});
prevBtn.addEventListener('click', goPrev);
nextBtn.addEventListener('click', goNext);
```

## 关键陷阱

### renderValue/renderFormatted 作用域

`renderValue()` 和 `renderFormatted()` 定义在 `showDictModal()` 函数内部。
当 patching 搜索工具栏时，**不能删除这两个函数的定义**——它们被初始渲染和 `updateSearch()` 共同调用。

如果 patch 范围覆盖了函数定义区域，必须在补丁中保留它们或将它们移到补丁范围外。

### 正则转义

搜索词必须转义正则特殊字符：
```javascript
const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```

### 高亮实现方式

用 `<mark class="dict-search-hit">` 包裹匹配文本，通过 CSS class 收集匹配元素。
不要用全局 indexOf 计数——DOM 查询更可靠。

### 当前匹配切换

切换当前匹配时，必须先将**所有** mark 元素重置为普通高亮样式，再设置当前为橙色。
直接修改 `style.cssText` 覆盖之前的样式。
