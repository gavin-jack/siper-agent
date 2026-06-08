# Capacitor WebView 路径问题排查指南

## 问题现象

APK 安装后：
- CSS 错乱（样式完全不加载）
- 按钮点击无响应
- 页面空白或布局混乱

## 根因

Capacitor WebView 加载 `file:///android_asset/public/index.html`，路径解析规则与 HTTP 服务器不同：

| 路径写法 | HTTP 服务器解析为 | WebView 解析为 |
|---------|-----------------|---------------|
| `/static/style.css` | `http://host/static/style.css` ✅ | `file:///static/style.css` ❌ |
| `static/style.css` | `http://host/static/style.css` ✅ | `file:///android_asset/public/static/style.css` ❌ |
| `style.css` | `http://host/style.css` ❌ | `file:///android_asset/public/style.css` ✅ |

**关键**：APK 内 `assets/public/` 是扁平结构，`style.css` 和 `pages/` 直接在根目录，没有 `static/` 子目录。

## 排查步骤

### 1. 检查 APK 内实际文件结构

```bash
python3 -c "
import zipfile
z = zipfile.ZipFile('android/app/build/outputs/apk/debug/app-debug.apk')
for n in z.namelist():
    if 'assets/public/' in n and not n.endswith('/'):
        print(n.replace('assets/public/', ''))
" | sort
```

### 2. 检查 index.html 中的路径

```bash
python3 -c "
import zipfile, re
z = zipfile.ZipFile('android/app/build/outputs/apk/debug/app-debug.apk')
content = z.read('assets/public/index.html').decode('utf-8')
links = re.findall(r'(href|src)=\"([^\"]+)\"', content)
for attr, path in links:
    if 'style' in path or 'script' in path.lower():
        print(f'{attr}=\"{path}\"')
"
```

### 3. 修复路径

```bash
cd android/app/src/main/assets/public/
cp index.html index.html.bak
sed -i 's|href="static/|href="|g' index.html
sed -i 's|src="static/|src="|g' index.html
```

### 4. 同步到 www/

```bash
cp android/app/src/main/assets/public/index.html www/index.html
```

### 5. 重新构建

```bash
cd android && ./gradlew assembleDebug --no-daemon
```

## 预防措施

- 修改前端文件后，始终同步到 `android/app/src/main/assets/public/`
- 构建前用 `diff` 验证两个目录一致
- 使用相对路径（无 `/` 前缀）引用同目录下的文件
