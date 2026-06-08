# renderMarkdown Node.js VM 测试模式 — 完整流程

## 背景

`browser_console` 中 `renderMarkdown` 为 `undefined`（函数定义在 renderMarkdown 闭包内，不暴露到全局）。
必须在 Node.js 中用 `vm` 模块 + mock DOM 测试渲染效果。

## 完整测试模板

```javascript
const vm = require('vm');
const fs = require('fs');

// 1. Mock DOM 元素
function mkEl() {
  return { innerHTML:'', textContent:'', className:'', children:[],
    appendChild:function(c){this.children.push(c)},
    style:{}, setAttribute:function(){}, addEventListener:function(){} };
}

// 2. 创建沙箱
var sandbox = {
  document: {
    createElement: mkEl,
    createTextNode: function(t){ return {textContent:t, children:[], appendChild:function(c){this.children.push(c)} }; },
    createDocumentFragment: function(){ return {children:[], appendChild:function(c){this.children.push(c)} }; },
    querySelector: function(){ return null; },
    querySelectorAll: function(){ return []; },
    addEventListener: function(){},
    styleSheets: [{cssRules:[]}],
  },
  window: {},
  navigator: { clipboard: { writeText: function(){ return Promise.resolve(); } } },
  setTimeout: function(fn){ fn(); },
  console: console,
  RegExp: RegExp, Math: Math, Array: Array, Object: Object,
  String: String, Number: Number, Boolean: Boolean, JSON: JSON,
  Promise: Promise, Infinity: Infinity,
};
var ctx = vm.createContext(sandbox);

// 3. 加载 renderMarkdown 函数
var funcCode = fs.readFileSync('/tmp/render_md_func.js', 'utf-8');
vm.runInContext(funcCode, ctx);

// 4. 定义 dumpNode 辅助函数
function dumpNode(node, depth) {
  if (depth > 8) return;
  var indent = ''; for (var d2 = 0; d2 < depth; d2++) indent += '  ';
  var tag = node.className || 'fragment';
  var text = '';
  if (node.textContent) text = JSON.stringify(node.textContent.substring(0, 200));
  var html = '';
  if (node.innerHTML) html = ' innerHTML=' + JSON.stringify(node.innerHTML.substring(0, 200));
  console.log(indent + tag + (text ? ' text=' + text : '') + html);
  if (node.children) {
    for (var ci = 0; ci < node.children.length; ci++)
      dumpNode(node.children[ci], depth + 1);
  }
}

// 5. 运行测试
var result = ctx.renderMarkdown('**修炼体系**');
dumpNode(result, 0);
```

## 提取 renderMarkdown 函数

```python
with open('/home/gavin/.siper/webui/static/pages/core.js', 'r') as f:
    content = f.read()

start = content.find('function renderMarkdown(text) {')
depth = 0
end = start
for i in range(start, len(content)):
    if content[i] == '{': depth += 1
    elif content[i] == '}':
        depth -= 1
        if depth == 0:
            end = i + 1
            break

func_str = content[start:end]
with open('/tmp/render_md_func.js', 'w') as f:
    f.write(func_str)
```

## 调试技巧

1. **插入 console.log**：在 renderMarkdown 函数内部关键位置插入 `console.log('...')`，通过 `vm.runInContext` 执行后查看输出
2. **分支追踪**：在每个 if/else 分支入口插入 `console.log('BRANCH: xxx')`，确认代码走哪个分支
3. **预处理追踪**：在预处理步骤后插入 `console.log('after step N:', JSON.stringify(l))`，查看每步对字符串的修改
4. **inline() 测试**：单独提取 inline() 函数，直接测试 `inline('**修炼体系**')` 确认加粗解析正确

## 注意事项

- JS 正则中 `\w` 不匹配中文字符（`\u4e00-\u9fff`），需要显式添加
- JS 字符串中的 `\n` 在 JSON.stringify 中会显示为 `\\n`
- `vm.createContext` 创建的沙箱中，`document` 是 mock 对象，不是真实 DOM
- 测试脚本写入 `/tmp/test_render.js`，用 `node /tmp/test_render.js` 执行
- 测试用例用 JSON 文件存储（`/tmp/test_cases.json`），避免 JS 字符串转义问题
