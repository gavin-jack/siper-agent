# Siper 项目审计检查清单

## 基础功能
- [ ] tool_registry 自注册重构（importlib 自动扫描 *_tool.py）
- [ ] web_search_tool.py check_fn（SearXNG/DDG 可达性）
- [ ] web_fetch_tool.py check_fn（网络连通性）
- [ ] execute_command_tool.py check_fn（bash/sh 可用）
- [ ] memory_tool.py check_fn（存储目录可写）
- [ ] _echo_tool.py 存在（下划线前缀，不参与自注册）

## Web UI 页面
- [ ] 聊天页面（主页面）
- [ ] Agent 配置页面（soul.md/agent.md/memory.md 三 Tab）
- [ ] 文件浏览器页面
- [ ] 定时任务管理页面
- [ ] 交互式日志页面
- [ ] Token 统计页面
- [ ] 网关控制页面（controlGateway/restartAllGateway）
- [ ] 外观设置页面（CSS 变量 + 主题模板 + 尺寸滑块）
- [ ] 全局设置页面（侧边栏底部 ⚙️ 按钮）

## 后端功能
- [ ] 消息队列功能（asyncio.Queue + _ws_msg_consumer）
- [ ] 全局设置持久化（save_agent_config_file）
- [ ] 图片识别（前端上传 + 后端保存 + multimodal）
- [ ] Web 认证（check_auth + AUTH_KEY + WS 首条消息认证）
- [ ] websockets 16.x API（websockets.asyncio.server.serve）
- [ ] 会话管理（延迟持久化）
- [ ] SSRF 防护（web_fetch 限制 scheme）

## 前端功能
- [ ] i18n 三语支持（data-i18n 属性）
- [ ] 语言切换器（.lang-switcher）
- [ ] 图片预览/上传/拖放/粘贴
- [ ] 工具调用过程显示
- [ ] SiPer 品牌（非 "AI Agent"）

## 代码质量
- [ ] 日志全部中文化
- [ ] CLI 静默（logger.info → debug）
- [ ] CSS/JS 类名一致性
- [ ] 无 CSS 循环引用
- [ ] 工具注册无 ERROR（启动日志中 8 个工具全部成功）
- [ ] WebFetchTool execute 方法声明完整（非 check_fn 内部代码）
- [ ] ExecuteCommandTool timeout 为实例属性（非 BaseTool 参数）

## 启动
- [ ] 启动命令简化（__main__ 自动重启，无需 nohup）
- [ ] venv Python 绝对路径

## Git
- [ ] commit message 不含 emoji
- [ ] 中文 commit message（格式：类型(范围): 描述）
- [ ] git user 配置（Gavin / gavin@siper.local）
