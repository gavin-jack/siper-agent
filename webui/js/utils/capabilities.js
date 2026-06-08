// utils/capabilities.js — 能力图标/标签/排序常量（单一来源）
// 所有 capIcons / capOrder / capLabels 的定义集中在此，其他文件 import 使用

export const CAP_ICONS = {
  vision: '👁', reasoning: '🧠', code: '💻', chat: '💬',
  tts: '🔊', embedding: '📎', image_gen: '🎨', long_context: '📏', function_calling: '🔧',
};

export const CAP_LABELS = {
  chat: '💬 对话', reasoning: '🧠 推理', vision: '👁 视觉', code: '💻 代码',
  tts: '🔊 语音', embedding: '📎 嵌入', image_gen: '🎨 生图', long_context: '📏 长上下文', function_calling: '🔧 工具调用',
};

// 用于旧版 settings modal（无 emoji 前缀）
export const CAP_LABELS_PLAIN = {
  vision: '视觉', reasoning: '推理', code: '代码', chat: '对话',
  tts: '语音', embedding: '嵌入', image_gen: '生图', long_context: '长上下文', function_calling: '工具调用',
};

export const CAP_ORDER = {
  chat: 0, reasoning: 1, vision: 2, code: 3, tts: 4,
  embedding: 5, image_gen: 6, long_context: 7, function_calling: 99,
};

/** 生成能力排序后的 badge HTML */
export function renderCapBadges(capabilities, iconMap = CAP_ICONS, plainLabels = false) {
  const labels = plainLabels ? CAP_LABELS_PLAIN : CAP_LABELS;
  const caps = (capabilities || []).slice().sort((a, b) => (CAP_ORDER[a] ?? 50) - (CAP_ORDER[b] ?? 50));
  return caps.map(c => {
    const label = labels[c] || c;
    const icon = iconMap[c] || c;
    return `<span class="siper-cap-badge" title="${label}">${icon}</span>`;
  }).join('');
}
