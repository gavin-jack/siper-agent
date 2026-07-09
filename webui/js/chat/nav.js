// nav.js — 统一页面路由
// 所有页面通过 app.js 的 navigateToPage() 动态加载
// 此文件保留路由相关的常量和辅助函数

import { setCurrentPage } from './state.js?v=1783620257626';

// 页面配置：标题 + 图标
export const PAGE_CONFIG = {
  chat:    { title: '对话', icon: '💬' },
  tasks:    { title: '任务', icon: '📋' },
  'model-settings': { title: '模型管理', icon: '🤖' },
  tools:    { title: '工具', icon: '🔧' },
  skills:    { title: '技能管理', icon: '🧩' },
  plugins:  { title: '插件管理', icon: '🔌' },
  monitor:  { title: '统计', icon: '📊' },
  directory: { title: '目录', icon: '📁' },
  'global-settings': { title: '全局设置', icon: '⚙️' },
  sessions: { title: '会话管理', icon: '📝' },
  memory:   { title: '记忆管理', icon: '🧠' },
  'agent-config': { title: '智能体配置', icon: '⚡' },
  'theme':  { title: '外观设置', icon: '🎨' },
  logs:     { title: '日志', icon: '📜' },
  token:    { title: '词元统计', icon: '📊' },
};

// 设置当前页面状态
export function setNavCurrentPage(page) {
  setCurrentPage(page);
}