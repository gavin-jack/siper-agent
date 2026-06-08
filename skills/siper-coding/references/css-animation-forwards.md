# CSS 动画 forwards 填充模式修复记录

## 问题描述

聊天消息、网关服务等元素使用 `@keyframes fadeIn` 动画，但动画结束后元素 opacity 回到 0，导致内容不可见。

## 根因

CSS 中定义：
```css
.msg { animation: fadeIn 0.2s ease; }
@keyframes fadeIn {
  0% { opacity: 0; transform: translateY(4px); }
  100% { opacity: 1; transform: translateY(0); }
}
```

`animation` 属性没有指定 `forwards` fill-mode，导致动画结束后元素恢复初始状态（opacity: 0）。

## 修复方法

```css
.msg { animation: fadeIn 0.2s ease forwards; }
```

## 影响范围

所有使用 `fadeIn` 动画的元素都需要添加 `forwards`：
- `.msg`（聊天消息）✅ 已修复
- 其他使用 fadeIn 的元素需逐一检查

## 检测方法

浏览器控制台：
```javascript
getComputedStyle(document.querySelector('.msg')).opacity  // 返回 "0" = 缺少 forwards
```

## 注意事项

- `forwards` 表示动画结束后保持最后一帧的状态
- 如果动画需要循环播放，用 `infinite` 而非 `forwards`
- `both` = forwards + backwards（开始前应用第一帧）
