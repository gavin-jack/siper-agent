// ===== i18n =====
const LANG = {
  zh: {
    'nav.main': '主要功能',

    'nav.chat': '对话',
    'nav.sessions': '会话',
    'nav.models': '模型',
    'nav.tasks': '任务',
    'nav.agent': '智能体',
    'nav.memory': '记忆',
    'memory.mdFile': '记忆文件',
    'memory.integration': '记忆整合',
    'memory.integrationTitle': '记忆整合进提示词的方式',
    'memory.selectAgent': '选择智能体...',
    'memory.noFile': '无记忆文件',
    'memory.save': '保存记忆',
    'memory.saveConfig': '保存配置',
    'memory.reset': '重置',
    'memory.resetConfig': '重置配置',
    'models.title': '模型管理',
    'models.globalPool': '全局模型池',
    'models.addNew': '添加新模型',
    'models.addBtn': '添加模型',
    'models.saveAll': '保存到全局配置',
    'models.refresh': '刷新',
    'models.empty': '暂无模型，请添加',
    'models.edit': '编辑',
    'models.remove': '删除',
    'models.enterName': '请输入模型名称',
    'models.exists': '模型已存在',
    'models.saved': '全局模型配置已保存',
    'models.saveFailed': '保存失败',
    'models.namePh': '模型名称 (如 LongCat-2.0)',
    'models.providerPh': 'Provider (如 longcat)',
    'models.baseUrlPh': 'Base URL',
    'models.apiKeyPh': 'API Key',
    'models.ctxPh': '上下文窗口 (tokens)',
    'memory.saved': '记忆已保存',
    'memory.configSaved': '配置已保存',
    'memory.saveFailed': '保存失败',
    'memory.mode': '整合模式',
    'memory.modeHint': '记忆内容如何嵌入提示词',
    'memory.modeAppend': '追加到系统提示词后',
    'memory.modePrepend': '插入到系统提示词前',
    'memory.modeSystem': '替换系统提示词',
    'memory.modeNone': '不整合（仅手动引用）',
    'memory.maxTokens': '最大 Token 数',
    'memory.maxTokensHint': '记忆内容最大长度限制',
    'memory.template': '提示词模板',
    'memory.templateHint': '用 {memory} 占位符插入记忆内容',
    'memory.preview': '预览效果',
    'memory.previewPlaceholder': '（记忆内容预览）',
    'memory.previewNone': '记忆未整合到提示词（仅手动引用）',
    'nav.skills': '技能',
    'nav.system': '系统',
    'nav.files': '文件',
    'nav.logs': '日志',
    'nav.token': 'Token',
    'nav.gateway': '网关',
    'nav.globalSettings': '全局设置',
    'nav.theme': '外观',
    'nav.language': '语言',
    'models.title': '模型管理',
    'models.globalPool': '全局模型池',
    'models.addNew': '添加新模型',
    'models.addBtn': '添加模型',
    'models.saveAll': '保存到全局配置',
    'models.refresh': '刷新',
    'models.empty': '暂无模型，请添加',
    'models.edit': '编辑',
    'models.remove': '删除',
    'models.enterName': '请输入模型名称',
    'models.exists': '模型已存在',
    'models.saved': '全局模型配置已保存',
    'models.saveFailed': '保存失败',
    'theme.title': '外观设置',
    'theme.colors': '颜色设置',
    'theme.sizes': '尺寸设置',
    'theme.templates': '模板管理',
    'theme.saveTemplate': '保存模板',
    'theme.loadTemplate': '加载',
    'theme.deleteTemplate': '删除',
    'theme.exportTemplate': '导出',
    'theme.templateNamePh': '输入模板名称...',
    'theme.reset': '重置默认',
    'theme.export': '导出配置',
    'theme.import': '导入配置',
    'theme.saved': '模板已保存',
    'theme.deleted': '模板已删除',
    'theme.loaded': '模板已加载',
    'theme.resetDone': '已重置为默认主题',
    'theme.exportDone': '配置已复制到剪贴板',
    'theme.importDone': '配置已导入',
    'theme.presets': '预设主题：',
    'theme.presetLight': '青绿',
    'theme.presetDark': '深蓝',
    'theme.presetSunset': '暖阳',
    'theme.presetForest': '森林',
    'theme.presetRose': '玫瑰',
    'theme.presetMidnight': '午夜',
    'theme.presetSakura': '樱花',
    'theme.presetSlate': '石墨',
    'theme.presetBlack': '纯黑',
    'theme.presetApplied': '预设主题已应用',
    // Global Settings
    'settings.title': '全局设置',
    'settings.save': '保存设置',
    'settings.refresh': '刷新',
    'settings.reset': '重置默认',
    'settings.modelConfig': '模型配置',
    'settings.model': '模型名称',
    'settings.provider': '服务商',
    'settings.baseUrl': 'API 地址',
    'settings.apiKey': 'API Key',
    'settings.contextWindow': '上下文窗口',
    'settings.systemParams': '系统参数',
    'settings.agentName': '智能体名称',
    'settings.port': '服务端口',
    'settings.maxTools': '最大并发工具数',
    'settings.sessionTimeout': '会话超时 (秒)',
    'settings.logLevel': '日志级别',
    'settings.appearance': '外观设置',
    'settings.icon': '图标',
    'settings.avatar': '头像 URL',
    'settings.models': '多模型管理',
    'settings.addModel': '添加模型',
    'settings.defaultModel': '默认模型',
    'settings.saved': '设置已保存',
    'settings.saveFailed': '保存失败：',
    'settings.loadFailed': '加载失败：',
    'settings.resetDone': '已重置为默认值',
    'settings.modelAdded': '模型已添加',
    'settings.modelRemoved': '模型已删除',
    'settings.confirmReset': '确定要重置所有设置为默认值吗？',
    'settings.debug': 'Debug 模式',
    'settings.debugDesc': '在消息下方显示完整响应数据',
    'settings.systemParams': '🔧 系统参数',
    'settings.systemRuntime': '运行时',
    'settings.wsHeartbeatTimeout': 'WS 心跳超时 (秒)',
    'settings.wsHeartbeatTimeoutHint': '无消息时断开 WebSocket 连接的时间',
    'settings.sessionListLimit': '会话列表加载数',
    'settings.sessionListLimitHint': '会话列表页面最多显示的会话条数',
    'settings.logBufferSize': '日志缓冲区大小',
    'settings.logBufferSizeHint': '内存中保留的日志条数（影响内存占用）',
    'settings.tokenUsageMax': 'Token 记录上限',
    'settings.tokenUsageMaxHint': 'Token 用量历史最大记录数',
    'settings.ctxWindowDefault': '上下文窗口默认值',
    'settings.ctxWindowDefaultHint': 'models.json 中未指定 context_window 时的默认值',
    'settings.restartRequired': '✦ 修改后需重启服务生效',
    'settings.resetDefaults': '重置默认',
    'settings.saveAndRestart': '保存并重启',
    'settings.systemParamsSaved': '系统参数已保存，正在重启...',
    'theme.importInvalid': '无效的配置',
    'theme.confirmDelete': '确定删除模板 "{0}"?',
    'theme.noTemplates': '暂无保存的模板',
    'theme.preview': '实时预览',
    'theme.bg': '背景色',
    'theme.bgSidebar': '侧边栏背景',
    'theme.bgCard': '卡片背景',
    'theme.bgHover': '悬停背景',
    'theme.border': '边框色',
    'theme.text': '主文本色',
    'theme.textDim': '次要文本色',
    'theme.accent': '强调色',
    'theme.accent2': '强调色2',
    'theme.green': '成功色',
    'theme.red': '错误色',
    'theme.yellow': '警告色',
    'theme.orange': '橙色',
    'theme.cyan': '青色',
    'theme.sidebarWidth': '侧边栏宽度',
    'theme.borderRadius': '圆角大小',
    'theme.fontSize': '字体大小',
    'theme.lineHeight': '行高',
    'theme.msgMaxWidth': '消息最大宽度',
    'theme.chatPadding': '聊天区边距',
    'status.connected': '已连接',
    'status.disconnected': '未连接',
    'chat.placeholder': '输入消息... (Enter 发送, Shift+Enter 换行, 粘贴图片直接发送)',
    'chat.send': '发送',
    'chat.typing': 'AI 正在思考',
    'chat.connecting': '连接断开，3秒后重连...',
    'chat.connected': 'WebSocket 已连接',
    'chat.disconnected': 'WebSocket 已断开，3秒后重连',
    'chat.error': '错误:',
    // Log messages (addLog)
    'log.wsConnected': 'WebSocket 已连接',
    'log.wsDisconnected': 'WebSocket 已断开，3秒后重连',
    'log.connection': '连接',
    'log.userMsg': '用户',
    'log.gatewayControl': '网关控制',
    'chat.switched': '已切换到会话:',
    'chat.newSession': '新会话已创建，发送消息开始对话',
    'sessions.title': '会话管理',
    'sessions.new': '+ 新会话',
    'sessions.refresh': '刷新',
    'sessions.clearAll': '清除全部',
    'sessions.empty': '暂无会话',
    'sessions.autoCreate': '发送消息后自动创建',
    'sessions.active': '活跃',
    'sessions.messages': '条消息',
    'sessions.newCreated': '新会话已创建，发送消息开始对话',
    'sessions.allCleared': '所有会话已清除',
    'sessions.confirmClear': '确定清除所有会话?',
    'sessions.confirmDelete': '确定删除会话 ',
    'sessions.selectPrompt': '← 点击会话查看消息',
    'sessions.openChat': '进入对话',
    'sessions.quickReply': '快速回复...',
    'sessions.send': '发送',
    'chat.user': '用户',
    'chat.agent': '智能体',
    'chat.loading': '加载中...',
    'chat.truncateNotice': '仅显示最新 {0} 条消息',
    'tasks.title': '定时任务',
    'tasks.new': '+ 新建任务',
    'tasks.refresh': '刷新',
    'tasks.total': '总任务',
    'tasks.enabled': '已启用',
    'tasks.totalRuns': '总执行',
    'tasks.empty': '暂无定时任务，点击"新建任务"创建',
    'tasks.newTask': '新建任务',
    'tasks.editTask': '编辑任务',
    'tasks.taskName': '任务名称 *',
    'tasks.taskNamePh': '例如：每日摘要',
    'tasks.cron': 'Cron 表达式 *',
    'tasks.prompt': '任务提示词 * (AI 将执行此提示词)',
    'tasks.promptPh': '输入 AI 需要执行的任务描述...',
    'tasks.enable': '启用任务',
    'tasks.cancel': '取消',
    'tasks.save': '保存',
    'tasks.confirmDelete': '确定删除此任务？',
    'tasks.triggered': '任务已触发执行',
    'tasks.executed': '执行成功',
    'tasks.failed': '执行失败',
    'tasks.noResponse': '(无响应)',
    'tasks.history': '执行历史',
    'tasks.loadFailed': '加载失败',
    'tasks.saveFailed': '保存失败:',
    'tasks.unknownError': '未知错误',
    'tasks.enterName': '请输入任务名称',
    'tasks.enterCron': '请输入 cron 表达式',
    'tasks.enterPrompt': '请输入任务提示词',
    'tasks.deleteFailed': '删除失败:',
    'tasks.cronFields': '需要5个字段: 分 时 日 月 周',
    'tasks.everyMin': '每分钟',
    'tasks.everyNMin': '每{0}分钟',
    'memory.title': '记忆存储',
    'memory.add': '+ 添加',
    'memory.refresh': '刷新',
    'memory.clearAll': '清除全部',
    'memory.count': ' 条',
    'memory.loading': '加载中...',
    'memory.empty': '暂无记忆数据',
    'memory.emptyHint': '点击「+ 添加」按钮添加记忆',
    'memory.loadFailed': '加载失败',
    'memory.addTitle': '添加记忆',
    'memory.key': '键名',
    'memory.keyPh': '例如：user_name',
    'memory.value': '内容',
    'memory.valuePh': '输入记忆内容...',
    'memory.cancel': '取消',
    'memory.save': '保存',
    'memory.saveSuccess': '记忆已保存',
    'memory.saveFailed': '保存失败:',
    'memory.confirmDelete': '确定删除记忆 "{0}"?',
    'memory.deleteSuccess': '记忆已删除',
    'memory.deleteFailed': '删除失败:',
    'memory.confirmClear': '确定清除所有记忆?',
    'memory.clearSuccess': '所有记忆已清除',
    'memory.clearFailed': '清除失败:',
    'memory.enterKey': '请输入键名',
    'memory.enterValue': '请输入内容',
    'skills.title': '技能管理',
    'skills.refresh': '刷新',
    'skills.empty': '暂无可用技能',
    'skills.loadFailed': '加载失败:',
    'logs.title': '系统日志',
    'logs.refresh': '刷新',
    'logs.autoOff': '自动刷新: 关',
    'logs.autoOn': '自动刷新: 开',
    'logs.clear': '清空显示',
    'logs.level': '级别:',
    'logs.source': '来源:',
    'logs.all': '全部',
    'logs.searchPh': '搜索关键词...',
    'logs.perPage': '每页:',
    'logs.empty': '暂无匹配日志',
    'logs.cleared': '显示已清空，刷新后恢复',
    'logs.loadFailed': '加载失败:',
    'token.title': 'Token 用量',
    'token.refresh': '刷新',
    'token.ctxWindow': '上下文窗口',
    'token.used': '已用 Token',
    'token.recent': '最近请求',
    'token.time': '时间',
    'token.model': 'Model',
    'token.prompt': 'Prompt',
    'token.completion': 'Completion',
    'token.total': 'Total',
    'token.totalTokens': '总 Token',
    'token.totalCalls': '总调用',
    'token.avgTokens': '平均 Token',
    'token.maxTokens': '最大 Token',
    'token.ctxUsage': '上下文使用率',
    'token.modelStats': '模型统计',
    'token.noHistory': '暂无使用记录',
    'gateway.title': '网关控制',
    'gateway.restartAll': '重启全部',
    'gateway.refresh': '刷新',
    'gateway.confirmRestart': '确定重启整个网关？这将中断所有连接并重新加载。',
    'gateway.confirmStop': '确定停止 {0}？',
    'gateway.confirmAction': '确定要',
    'gateway.confirmRestartAll': '确定重启全部服务？所有运行中的服务将短暂中断。',
    'gateway.actionSuccess': '操作成功',
    'gateway.actionFailed': '操作失败',
    'gateway.restarting': '网关正在刷新，请稍候重新连接…',
    'gateway.noData': '无服务数据',
    'gateway.loadFailed': '加载失败:',
    'agent.title': '智能体配置',
    'agent.switch': '切换智能体',
    'agent.refresh': '刷新',
    'agent.available': '可用智能体',
    'agent.settings': '智能体设置',
    'agent.displayName': '显示名称',
    'agent.displayNameHint': '智能体在界面上的名称',
    'agent.icon': '图标 / Emoji',
    'agent.iconHint': '显示在侧边栏和列表中',
    'agent.avatar': '头像 URL',
    'agent.avatarHint': '可选，留空则使用图标',
    'agent.maxTools': '最大并发工具数',
    'agent.maxToolsHint': '同时执行的工具上限',
    'agent.timeout': '会话超时 (秒)',
    'agent.timeoutHint': '空闲会话自动关闭时间',
    'agent.reset': '重置',
        'agent.saveSettings': '保存设置',
    'agent.selectAgent': '选择智能体...',
    'agent.tabAbout': '关于智能体',
    'agent.tabFiles': '智能体配置文件',
    'agent.tabModels': '🤖 模型配置',
    'agent.tabLimits': '⚡ 回复限制',
    'agent.limits': '回复限制',
    'agent.limitsLlm': 'LLM 调用',
    'agent.llmTimeout': '请求超时 (秒)',
    'agent.llmTimeoutHint': '单次 API 调用等待时间',
    'agent.llmMaxTokens': '最大输出 Token',
    'agent.llmMaxTokensHint': '单次回复最大长度',
    'agent.llmMaxRetries': '最大重试次数',
    'agent.llmMaxRetriesHint': '超时后自动重试轮数',
    'agent.limitsTool': '工具调用',
    'agent.maxToolRounds': '最大工具轮数',
    'agent.maxToolRoundsHint': '单条消息最多工具调用轮次',
    'agent.maxTools': '最大并发工具数',
    'agent.maxToolsHint': '同时执行的工具数上限',
    'agent.limitsSession': '会话',
    'agent.sessionTimeout': '会话超时 (秒)',
    'agent.sessionTimeoutHint': '空闲会话保留时间',
    'agent.maxHistoryMessages': '历史消息加载数',
    'agent.maxHistoryMessagesHint': '每次加载的历史消息条数',
    'agent.limitsMemory': '记忆',
    'agent.memoryMaxTokens': '记忆最大 Token',
    'agent.memoryMaxTokensHint': '记忆整合到提示词的最大长度',
    'agent.limitsSkill': '技能',
    'agent.skillPreFilterTopK': '技能预筛选 Top-K',
    'agent.skillPreFilterTopKHint': '预筛选返回的技能数量（影响匹配精度和提示词长度）',
    'agent.autoSaveHint': '✦ 修改后自动保存',
    'agent.resetLimits': '重置默认',
    'agent.limitsReset': '已重置为默认值',
    'agent.appearance': '外观设置',
    'agent.runtime': '运行设置',
    'agent.msgFontSize': '消息字体大小',
    'agent.msgBg': '消息背景色',
    'agent.msgText': '消息文字颜色',
    'agent.msgBorder': '消息边框颜色',
    'agent.models': '模型管理',
    'agent.modelsHint': '— 每个智能体可使用不同模型',
    'agent.addModel': '添加新模型',
    'agent.modelName': '模型名称 (如 LongCat-2.0)',
    'agent.provider': 'Provider (如 longcat)',
    'agent.baseUrl': 'Base URL',
    'agent.apiKey': 'API Key',
    'agent.ctxWindow': '上下文窗口 (tokens)',
    'agent.addModelBtn': '添加模型',
    'agent.saveAllModels': '保存所有模型',
    'agent.configFiles': '配置文件',
    'agent.saved': '智能体设置已保存',
    'agent.modelSaved': '模型设置已保存',
    'agent.saveFailed': '保存失败:',
    'agent.selectFirst': '请先选择一个智能体',
    'agent.enterModelName': '请输入模型名称',
    'agent.modelExists': '模型名称已存在',
    'agent.modelsSaved': '模型配置已保存',
    'agent.fileSaved': '文件已保存',
    'agent.fileSaveFailed': '保存失败:',
    'agent.switchSuccess': '已切换到智能体: ',
    'agent.switchFailed': '切换失败:',
    'agent.noOther': '没有其他可用的智能体',
    'agent.empty': '暂无可用智能体',
    'agent.loadFailed': '加载失败:',
    'agent.loading': '加载中...',
    'files.title': '文件浏览器',
    'files.refresh': '刷新',
    'files.pathConvert': '路径转换',
    'files.windowsPath': 'Windows 路径',
    'files.windowsPathHint': '输入 Windows 或 WSL 路径，自动转换为 Linux 路径',
    'files.convert': '转换',
    'files.browse': '浏览',
    'files.up': '上级',
    'files.original': '原始:',
    'files.converted': '转换:',
    'files.usePath': '使用此路径浏览',
    'files.copyPath': '复制路径',
    'files.dirBrowse': '目录浏览',
    'files.pathPh': '输入路径 (支持 Windows 路径自动转换)',
    'files.pathWindowsPh': 'C:\\\\Users\\\\Gavin\\\\Desktop 或 \\\\\\\\wsl.localhost\\\\Ubuntu\\\\home',
    'files.empty': '空目录',
    'files.loadError': 'Error:',
    'tools.viewCalls': ' 工具调用',
    'tools.noParams': '(无参数)',
    'tools.noResult': '(无结果)',
    'tools.truncated': '\\n... (已截断)',
    'tools.params': '参数',
    'tools.result': '结果',
    'time.justNow': '刚刚',
    'time.minAgo': '分钟前',
    'time.hourAgo': '小时前',
    // Toast
    'toast.copied': '消息已复制',
    'toast.copyFailed': '复制失败',
    'toast.moved': '消息已移动',
    'toast.refreshed': '已刷新',
    'toast.loadFailed': '加载失败',
    'toast.selectFirst': '请先选择一项',
    'toast.saved': '已保存',
    'toast.saveFailed': '保存失败',
    'toast.unknownError': '未知错误',
    'toast.modelExists': '模型已存在',
    'toast.enterModelName': '请输入模型名称',
    'toast.modelsSaved': '模型配置已保存',
    'toast.fileSaved': '文件已保存',
    'toast.switchSuccess': '已切换到',
    'toast.switchFailed': '切换失败',
    'toast.enterBaseUrl': '请输入 Base URL',
    'toast.enterApiKey': '请输入 API Key',
    'toast.modelAdded': '模型已添加',
    'toast.verifyFailed': '模型验证失败',
    'toast.modelSaved': '模型已保存',
    'toast.resetDone': '已重置为默认值',
    'toast.refreshFailed': '刷新失败',
    'toast.enterName': '请输入名称',
    'toast.enterCron': '请输入 cron 表达式',
    'toast.enterPrompt': '请输入任务提示词',
    'toast.triggered': '任务已触发执行',
    'toast.deleteFailed': '删除失败',
    'toast.cronFields': '需要5个字段: 分 时 日 月 周',
    // Page refresh/success toasts
    'sessions.refreshed': '会话已刷新',
    'sessions.refreshFailed': '会话刷新失败',
    'logs.refreshed': '日志已刷新',
    'memory.refreshed': '记忆已刷新',
    'settings.refreshed': '设置已刷新',
    'settings.refreshFailed': '设置刷新失败',
    'settings.modelSaved': '模型已保存',
    'skills.refreshed': '技能已刷新',
    'tasks.refreshed': '任务已刷新',
    'token.refreshed': 'Token 用量已刷新',
    'token.refreshFailed': 'Token 刷新失败',
    'agent.selectConfigAgent': '选择智能体...',
    'chat.copied': '消息已复制',
    'chat.copyFailed': '复制失败',
    'chat.noModels': '暂无可用模型',
    'chat.visionWarnTitle': '模型不支持图片识别',
    'chat.visionWarnBody': '当前模型 {model} 不支持图片识别，无法处理您发送的图片。',
    'chat.visionWarnSwitch': '切换到支持图片识别的模型：',
    'chat.visionWarnSwitchBtn': '切换',
    'chat.visionWarnNoModels': '当前没有配置支持图片识别的模型。',
    'chat.visionWarnHint': '请在「模型管理」中添加支持 vision 能力的模型（如 LongCat-2.0-Preview、deepseek-v4-flash 等）。',
    'chat.visionWarnClose': '关闭',
  },
  en: {
    'nav.main': 'Main',

    'nav.chat': 'Chat',
    'nav.sessions': 'Sessions',
    'nav.models': 'Models',
    'models.title': 'Model Management',
    'models.globalPool': 'Global Model Pool',
    'models.addNew': 'Add New Model',
    'models.addBtn': 'Add Model',
    'models.saveAll': 'Save to Global Config',
    'models.refresh': 'Refresh',
    'models.empty': 'No models yet, please add one',
    'models.edit': 'Edit',
    'models.remove': 'Remove',
    'models.enterName': 'Please enter model name',
    'models.exists': 'Model already exists',
    'models.saved': 'Global model config saved',
    'models.saveFailed': 'Save failed',
    'models.namePh': 'Model name (e.g. LongCat-2.0)',
    'models.providerPh': 'Provider (e.g. longcat)',
    'models.baseUrlPh': 'Base URL',
    'models.apiKeyPh': 'API Key',
    'models.ctxPh': 'Context window (tokens)',
    'nav.tasks': 'Tasks',
    'nav.agent': 'Agent',
    'nav.memory': 'Memory',
    'memory.mdFile': 'Memory File',
    'memory.integration': 'Memory Integration',
    'memory.integrationTitle': 'How Memory is Integrated into Prompts',
    'memory.selectAgent': 'Select Agent...',
    'memory.noFile': 'No memory file',
    'memory.save': 'Save Memory',
    'memory.saveConfig': 'Save Config',
    'memory.reset': 'Reset',
    'memory.resetConfig': 'Reset Config',
    'memory.saved': 'Memory saved',
    'memory.configSaved': 'Config saved',
    'memory.saveFailed': 'Save failed',
    'memory.mode': 'Integration Mode',
    'memory.modeHint': 'How memory content is embedded into prompts',
    'memory.modeAppend': 'Append after system prompt',
    'memory.modePrepend': 'Insert before system prompt',
    'memory.modeSystem': 'Replace system prompt',
    'memory.modeNone': 'No integration (manual reference only)',
    'memory.maxTokens': 'Max Tokens',
    'memory.maxTokensHint': 'Maximum length limit for memory content',
    'memory.template': 'Prompt Template',
    'memory.templateHint': 'Use {memory} placeholder for memory content',
    'memory.preview': 'Preview',
    'memory.previewPlaceholder': '(memory content preview)',
    'memory.previewNone': 'Memory not integrated into prompt (manual reference only)',
    'nav.skills': 'Skills',
    'nav.system': 'System',
    'nav.files': 'Files',
    'nav.logs': 'Logs',
    'nav.token': 'Token',
    'nav.gateway': 'Gateway',
    'nav.globalSettings': 'Global Settings',
    'nav.theme': 'Theme',
    'theme.title': 'Appearance Settings',
    'theme.colors': 'Colors',
    'theme.sizes': 'Sizes',
    'theme.templates': 'Templates',
    'theme.saveTemplate': 'Save Template',
    'theme.loadTemplate': 'Load',
    'theme.deleteTemplate': 'Delete',
    'theme.exportTemplate': 'Export',
    'theme.templateNamePh': 'Enter template name...',
    'theme.reset': 'Reset Default',
    'theme.export': 'Export Config',
    'theme.import': 'Import Config',
    'theme.saved': 'Template saved',
    'theme.deleted': 'Template deleted',
    'theme.loaded': 'Template loaded',
    'theme.resetDone': 'Reset to default theme',
    'theme.exportDone': 'Config copied to clipboard',
    'theme.importDone': 'Config imported',
    'theme.presets': 'Presets:',
    'theme.presetLight': 'Teal Light',
    'theme.presetDark': 'GitHub Dark',
    'theme.presetOcean': 'Ocean',
    'theme.presetSunset': 'Sunset',
    'theme.presetForest': 'Forest',
    'theme.presetRose': 'Rose',
    'theme.presetMidnight': 'Midnight',
    'theme.presetSakura': 'Sakura',
    'theme.presetSlate': 'Slate',
    'theme.presetBlack': 'Pure Black',
    'theme.presetApplied': 'Preset applied',
    // Global Settings
    'settings.title': 'Global Settings',
    'settings.save': 'Save Settings',
    'settings.refresh': 'Refresh',
    'settings.reset': 'Reset Default',
    'settings.modelConfig': 'Model Configuration',
    'settings.model': 'Model Name',
    'settings.provider': 'Provider',
    'settings.baseUrl': 'API URL',
    'settings.apiKey': 'API Key',
    'settings.contextWindow': 'Context Window',
    'settings.systemParams': 'System Parameters',
    'settings.agentName': 'Agent Name',
    'settings.port': 'Service Port',
    'settings.maxTools': 'Max Concurrent Tools',
    'settings.sessionTimeout': 'Session Timeout (sec)',
    'settings.logLevel': 'Log Level',
    'settings.appearance': 'Appearance',
    'settings.icon': 'Icon',
    'settings.avatar': 'Avatar URL',
    'settings.models': 'Multi-Model Management',
    'settings.addModel': 'Add Model',
    'settings.defaultModel': 'Default Model',
    'settings.saved': 'Settings saved',
    'settings.saveFailed': 'Save failed: ',
    'settings.loadFailed': 'Load failed: ',
    'settings.resetDone': 'Reset to defaults',
    'settings.modelAdded': 'Model added',
    'settings.modelRemoved': 'Model removed',
    'settings.confirmReset': 'Reset all settings to defaults?',
    'settings.debug': 'Debug Mode',
    'settings.debugDesc': 'Show full response data below messages',
    'settings.systemParams': '🔧 System Parameters',
    'settings.systemRuntime': 'Runtime',
    'settings.wsHeartbeatTimeout': 'WS Heartbeat Timeout (sec)',
    'settings.wsHeartbeatTimeoutHint': 'Time to disconnect WebSocket when no message received',
    'settings.sessionListLimit': 'Session List Limit',
    'settings.sessionListLimitHint': 'Max sessions shown on session list page',
    'settings.logBufferSize': 'Log Buffer Size',
    'settings.logBufferSizeHint': 'Max log entries kept in memory (affects RAM usage)',
    'settings.tokenUsageMax': 'Token Usage Record Limit',
    'settings.tokenUsageMaxHint': 'Max token usage history records',
    'settings.ctxWindowDefault': 'Context Window Default',
    'settings.ctxWindowDefaultHint': 'Default context window when not specified in models.json',
    'settings.restartRequired': '✦ Restart required after changes',
    'settings.resetDefaults': 'Reset Defaults',
    'settings.saveAndRestart': 'Save & Restart',
    'settings.systemParamsSaved': 'System parameters saved, restarting...',
    'theme.importInvalid': 'Invalid config',
    'theme.confirmDelete': 'Delete template "{0}"?',
    'theme.noTemplates': 'No saved templates',
    'theme.preview': 'Live Preview',
    'theme.bg': 'Background',
    'theme.bgSidebar': 'Sidebar Background',
    'theme.bgCard': 'Card Background',
    'theme.bgHover': 'Hover Background',
    'theme.border': 'Border Color',
    'theme.text': 'Primary Text',
    'theme.textDim': 'Secondary Text',
    'theme.accent': 'Accent',
    'theme.accent2': 'Accent 2',
    'theme.green': 'Success',
    'theme.red': 'Error',
    'theme.yellow': 'Warning',
    'theme.orange': 'Orange',
    'theme.cyan': 'Cyan',
    'theme.sidebarWidth': 'Sidebar Width',
    'theme.borderRadius': 'Border Radius',
    'theme.fontSize': 'Font Size',
    'theme.msgMaxWidth': 'Message Max Width',
    'theme.chatPadding': 'Chat Padding',
    'status.connected': 'Connected',
    'status.disconnected': 'Disconnected',
    'chat.placeholder': 'Type a message... (Enter to send, Shift+Enter for newline, paste images to send)',
    'chat.send': 'Send',
    'chat.typing': 'AI is thinking',
    'chat.connecting': 'Connection lost, reconnecting in 3s...',
    'chat.connected': 'WebSocket connected',
    'chat.disconnected': 'WebSocket disconnected, reconnecting in 3s',
    'chat.error': 'Error:',
    // Log messages (addLog)
    'log.wsConnected': 'WebSocket connected',
    'log.wsDisconnected': 'WebSocket disconnected, reconnecting in 3s',
    'log.connection': 'Connection',
    'log.userMsg': 'User',
    'log.gatewayControl': 'Gateway control',
    'chat.switched': 'Switched to session:',
    'chat.newSession': 'New session created, send a message to start',
    'sessions.title': 'Sessions',
    'sessions.new': '+ New Session',
    'sessions.refresh': 'Refresh',
    'sessions.clearAll': 'Clear All',
    'sessions.empty': 'No sessions',
    'sessions.autoCreate': 'Auto-created when you send a message',
    'sessions.active': 'Active',
    'sessions.messages': 'messages',
    'sessions.newCreated': 'New session created, send a message to start',
    'sessions.allCleared': 'All sessions cleared',
    'sessions.confirmClear': 'Clear all sessions?',
    'sessions.confirmDelete': 'Delete session ',
    'sessions.selectPrompt': '← Click a session to view messages',
    'sessions.openChat': 'Open Chat',
    'sessions.quickReply': 'Quick reply...',
    'sessions.send': 'Send',
    'chat.user': 'User',
    'chat.agent': 'Agent',
    'chat.loading': 'Loading...',
    'chat.truncateNotice': 'Showing latest {0} messages only',
    'tasks.title': 'Scheduled Tasks',
    'tasks.new': '+ New Task',
    'tasks.refresh': 'Refresh',
    'tasks.total': 'Total',
    'tasks.enabled': 'Enabled',
    'tasks.totalRuns': 'Total Runs',
    'tasks.empty': 'No scheduled tasks, click "New Task" to create',
    'tasks.newTask': 'New Task',
    'tasks.editTask': 'Edit Task',
    'tasks.taskName': 'Task Name *',
    'tasks.taskNamePh': 'e.g. Daily Summary',
    'tasks.cron': 'Cron Expression *',
    'tasks.prompt': 'Task Prompt * (AI will execute this)',
    'tasks.promptPh': 'Enter task description for AI to execute...',
    'tasks.enable': 'Enable Task',
    'tasks.cancel': 'Cancel',
    'tasks.save': 'Save',
    'tasks.confirmDelete': 'Delete this task?',
    'tasks.triggered': 'Task triggered',
    'tasks.executed': 'Success',
    'tasks.failed': 'Failed',
    'tasks.noResponse': '(no response)',
    'tasks.history': 'Execution History',
    'tasks.loadFailed': 'Load failed',
    'tasks.saveFailed': 'Save failed:',
    'tasks.unknownError': 'Unknown error',
    'tasks.enterName': 'Please enter task name',
    'tasks.enterCron': 'Please enter cron expression',
    'tasks.enterPrompt': 'Please enter task prompt',
    'tasks.deleteFailed': 'Delete failed:',
    'tasks.cronFields': 'Need 5 fields: min hour dom month dow',
    'tasks.everyMin': 'Every minute',
    'tasks.everyNMin': 'Every {0} minutes',
    'memory.title': 'Memory Store',
    'memory.add': '+ Add',
    'memory.refresh': 'Refresh',
    'memory.clearAll': 'Clear All',
    'memory.count': '',
    'memory.loading': 'Loading...',
    'memory.empty': 'No memory data',
    'memory.emptyHint': 'Click "+ Add" to add memory',
    'memory.loadFailed': 'Load failed',
    'memory.addTitle': 'Add Memory',
    'memory.key': 'Key',
    'memory.keyPh': 'e.g. user_name',
    'memory.value': 'Value',
    'memory.valuePh': 'Enter memory content...',
    'memory.cancel': 'Cancel',
    'memory.save': 'Save',
    'memory.saveSuccess': 'Memory saved',
    'memory.saveFailed': 'Save failed:',
    'memory.confirmDelete': 'Delete memory "{0}"?',
    'memory.deleteSuccess': 'Memory deleted',
    'memory.deleteFailed': 'Delete failed:',
    'memory.confirmClear': 'Clear all memory?',
    'memory.clearSuccess': 'All memory cleared',
    'memory.clearFailed': 'Clear failed:',
    'memory.enterKey': 'Please enter key',
    'memory.enterValue': 'Please enter value',
    'skills.title': 'Skills',
    'skills.refresh': 'Refresh',
    'skills.empty': 'No skills available',
    'skills.loadFailed': 'Load failed:',
    'logs.title': 'System Logs',
    'logs.refresh': 'Refresh',
    'logs.autoOff': 'Auto Refresh: Off',
    'logs.autoOn': 'Auto Refresh: On',
    'logs.clear': 'Clear',
    'logs.level': 'Level:',
    'logs.source': 'Source:',
    'logs.all': 'All',
    'logs.searchPh': 'Search...',
    'logs.perPage': 'Per page:',
    'logs.empty': 'No matching logs',
    'logs.cleared': 'Display cleared, refresh to restore',
    'logs.loadFailed': 'Load failed:',
    'token.title': 'Token Usage',
    'token.refresh': 'Refresh',
    'token.ctxWindow': 'Context Window',
    'token.used': 'Used Tokens',
    'token.recent': 'Recent Requests',
    'token.time': 'Time',
    'token.model': 'Model',
    'token.prompt': 'Prompt',
    'token.completion': 'Completion',
    'token.total': 'Total',
    'token.totalTokens': 'Total Tokens',
    'token.totalCalls': 'Total Calls',
    'token.avgTokens': 'Avg Tokens',
    'token.maxTokens': 'Max Tokens',
    'token.ctxUsage': 'Context Usage',
    'token.modelStats': 'Model Stats',
    'token.noHistory': 'No usage history',
    'gateway.title': 'Gateway Control',
    'gateway.restartAll': 'Restart All',
    'gateway.refresh': 'Refresh',
    'gateway.confirmRestart': 'Restart entire gateway? This will interrupt all connections.',
    'gateway.confirmStop': 'Stop {0}?',
    'gateway.confirmAction': 'Are you sure you want to',
    'gateway.confirmRestartAll': 'Restart all services? All running services will be briefly interrupted.',
    'gateway.actionSuccess': 'Action successful',
    'gateway.actionFailed': 'Action failed',
    'gateway.restarting': 'Gateway is restarting, please reconnect…',
    'gateway.noData': 'No service data',
    'gateway.loadFailed': 'Load failed:',
    'agent.title': 'Agent Config',
    'agent.switch': 'Switch Agent',
    'agent.refresh': 'Refresh',
    'agent.available': 'Available Agents',
    'agent.settings': 'Agent Settings',
    'agent.displayName': 'Display Name',
    'agent.displayNameHint': 'Name shown in the UI',
    'agent.icon': 'Icon / Emoji',
    'agent.iconHint': 'Shown in sidebar and lists',
    'agent.avatar': 'Avatar URL',
    'agent.avatarHint': 'Optional, uses icon if empty',
    'agent.maxTools': 'Max Concurrent Tools',
    'agent.maxToolsHint': 'Limit of simultaneous tool execution',
    'agent.timeout': 'Session Timeout (sec)',
    'agent.timeoutHint': 'Idle session auto-close time',
    'agent.reset': 'Reset',
        'agent.saveSettings': 'Save Settings',
    'agent.selectAgent': 'Select Agent...',
    'agent.tabAbout': 'About Agent',
    'agent.tabFiles': 'Config Files',
    'agent.tabModels': '🤖 Model Config',
    'agent.tabLimits': '⚡ Response Limits',
    'agent.limits': 'Response Limits',
    'agent.limitsLlm': 'LLM Calls',
    'agent.llmTimeout': 'Request Timeout (sec)',
    'agent.llmTimeoutHint': 'Single API call wait time',
    'agent.llmMaxTokens': 'Max Output Tokens',
    'agent.llmMaxTokensHint': 'Maximum reply length per response',
    'agent.llmMaxRetries': 'Max Retries',
    'agent.llmMaxRetriesHint': 'Auto-retry rounds after timeout',
    'agent.limitsTool': 'Tool Calls',
    'agent.maxToolRounds': 'Max Tool Rounds',
    'agent.maxToolRoundsHint': 'Max tool invocation rounds per message',
    'agent.maxTools': 'Max Concurrent Tools',
    'agent.maxToolsHint': 'Limit of simultaneous tool execution',
    'agent.limitsSession': 'Session',
    'agent.sessionTimeout': 'Session Timeout (sec)',
    'agent.sessionTimeoutHint': 'Idle session auto-close time',
    'agent.maxHistoryMessages': 'History Message Limit',
    'agent.maxHistoryMessagesHint': 'Number of history messages loaded per request',
    'agent.limitsMemory': 'Memory',
    'agent.memoryMaxTokens': 'Memory Max Tokens',
    'agent.memoryMaxTokensHint': 'Max length of memory integrated into prompt',
    'agent.limitsSkill': 'Skills',
    'agent.skillPreFilterTopK': 'Skill Pre-filter Top-K',
    'agent.skillPreFilterTopKHint': 'Number of skills returned by pre-filter (affects match accuracy & prompt length)',
    'agent.autoSaveHint': '✦ Auto-saved on change',
    'agent.resetLimits': 'Reset Defaults',
    'agent.limitsReset': 'Reset to defaults',
    'agent.appearance': 'Appearance',
    'agent.runtime': 'Runtime Settings',
    'agent.msgFontSize': 'Message Font Size',
    'agent.msgBg': 'Message Background',
    'agent.msgText': 'Message Text Color',
    'agent.msgBorder': 'Message Border',
    'agent.models': 'Model Management',
    'agent.modelsHint': '— Each agent can use different models',
    'agent.addModel': 'Add New Model',
    'agent.modelName': 'Model Name (e.g. LongCat-2.0)',
    'agent.provider': 'Provider (e.g. longcat)',
    'agent.baseUrl': 'Base URL',
    'agent.apiKey': 'API Key',
    'agent.ctxWindow': 'Context Window (tokens)',
    'agent.addModelBtn': 'Add Model',
    'agent.saveAllModels': 'Save All Models',
    'agent.configFiles': 'Config Files',
    'agent.saved': 'Agent settings saved',
    'agent.modelSaved': 'Model settings saved',
    'agent.saveFailed': 'Save failed:',
    'agent.selectFirst': 'Please select an agent first',
    'agent.enterModelName': 'Please enter model name',
    'agent.modelExists': 'Model name already exists',
    'agent.modelsSaved': 'Model config saved',
    'agent.fileSaved': 'File saved',
    'agent.fileSaveFailed': 'Save failed:',
    'agent.switchSuccess': 'Switched to agent: ',
    'agent.switchFailed': 'Switch failed:',
    'agent.noOther': 'No other agents available',
    'agent.empty': 'No agents available',
    'agent.loadFailed': 'Load failed:',
    'agent.loading': 'Loading...',
    'files.title': 'File Browser',
    'files.refresh': 'Refresh',
    'files.pathConvert': 'Path Conversion',
    'files.windowsPath': 'Windows Path',
    'files.windowsPathHint': 'Enter Windows or WSL path, auto-convert to Linux path',
    'files.convert': 'Convert',
    'files.browse': 'Browse',
    'files.up': 'Up',
    'files.original': 'Original:',
    'files.converted': 'Converted:',
    'files.usePath': 'Browse This Path',
    'files.copyPath': 'Copy Path',
    'files.dirBrowse': 'Directory Browser',
    'files.pathPh': 'Enter path (Windows path auto-conversion supported)',
    'files.pathWindowsPh': 'C:\\\\Users\\\\Gavin\\\\Desktop  or  \\\\\\\\wsl.localhost\\\\Ubuntu\\\\home',
    'files.empty': 'Empty directory',
    'files.loadError': 'Error:',
    'tools.viewCalls': ' tool call(s)',
    'tools.noParams': '(no params)',
    'tools.noResult': '(no result)',
    'tools.truncated': '\\n... (truncated)',
    'tools.params': 'Params',
    'tools.result': 'Result',
    'time.justNow': 'Just now',
    'time.minAgo': ' min ago',
    'time.hourAgo': ' hours ago',
    // Toast
    'toast.copied': 'Message copied',
    'toast.copyFailed': 'Copy failed',
    'toast.moved': 'Message moved',
    'toast.refreshed': 'Refreshed',
    'toast.loadFailed': 'Load failed',
    'toast.selectFirst': 'Please select an item first',
    'toast.saved': 'Saved',
    'toast.saveFailed': 'Save failed',
    'toast.unknownError': 'Unknown error',
    'toast.modelExists': 'Model already exists',
    'toast.enterModelName': 'Please enter model name',
    'toast.modelsSaved': 'Model config saved',
    'toast.fileSaved': 'File saved',
    'toast.switchSuccess': 'Switched to',
    'toast.switchFailed': 'Switch failed',
    'toast.enterBaseUrl': 'Please enter Base URL',
    'toast.enterApiKey': 'Please enter API Key',
    'toast.modelAdded': 'Model added',
    'toast.verifyFailed': 'Model verification failed',
    'toast.modelSaved': 'Model saved',
    'toast.resetDone': 'Reset to defaults',
    'toast.refreshFailed': 'Refresh failed',
    'toast.enterName': 'Please enter name',
    'toast.enterCron': 'Please enter cron expression',
    'toast.enterPrompt': 'Please enter task prompt',
    'toast.triggered': 'Task triggered',
    'toast.deleteFailed': 'Delete failed',
    'toast.cronFields': 'Need 5 fields: min hour dom month dow',
    // Page refresh/success toasts
    'sessions.refreshed': 'Sessions refreshed',
    'sessions.refreshFailed': 'Sessions refresh failed',
    'logs.refreshed': 'Logs refreshed',
    'memory.refreshed': 'Memory refreshed',
    'settings.refreshed': 'Settings refreshed',
    'settings.refreshFailed': 'Settings refresh failed',
    'settings.modelSaved': 'Model saved',
    'skills.refreshed': 'Skills refreshed',
    'tasks.refreshed': 'Tasks refreshed',
    'token.refreshed': 'Token usage refreshed',
    'token.refreshFailed': 'Token refresh failed',
    'agent.selectConfigAgent': 'Select Agent...',
    'chat.copied': 'Message copied',
    'chat.copyFailed': 'Copy failed',
    'chat.noModels': 'No models available',
    'chat.visionWarnTitle': 'Model Does Not Support Image Recognition',
    'chat.visionWarnBody': 'Current model {model} does not support image recognition and cannot process your images.',
    'chat.visionWarnSwitch': 'Switch to a vision-capable model:',
    'chat.visionWarnSwitchBtn': 'Switch',
    'chat.visionWarnNoModels': 'No image-recognition models are currently configured.',
    'chat.visionWarnHint': 'Please add a model with vision capability (e.g. LongCat-2.0-Preview, deepseek-v4-flash) in Model Management.',
    'chat.visionWarnClose': 'Close',
  },
  tw: {
    'nav.main': '主要功能',

    'nav.chat': '對話',
    'nav.sessions': '會話',
    'nav.models': '模型',
    'nav.tasks': '任務',
    'nav.agent': '智能體',
    'nav.memory': '記憶',
    'memory.mdFile': '記憶檔案',
    'memory.integration': '記憶整合',
    'memory.integrationTitle': '記憶整合進提示詞的方式',
    'memory.selectAgent': '選擇智能體...',
    'memory.noFile': '無記憶檔案',
    'memory.save': '儲存記憶',
    'memory.saveConfig': '儲存配置',
    'memory.reset': '重設',
    'memory.resetConfig': '重設配置',
    'models.title': '模型管理',
    'models.globalPool': '全局模型池',
    'models.addNew': '添加新模型',
    'models.addBtn': '添加模型',
    'models.saveAll': '儲存到全局配置',
    'models.refresh': '刷新',
    'models.empty': '暫無模型，請添加',
    'models.edit': '編輯',
    'models.remove': '刪除',
    'models.enterName': '請輸入模型名稱',
    'models.exists': '模型已存在',
    'models.saved': '全局模型配置已儲存',
    'models.saveFailed': '儲存失敗',
    'models.namePh': '模型名稱 (如 LongCat-2.0)',
    'models.providerPh': 'Provider (如 longcat)',
    'models.baseUrlPh': 'Base URL',
    'models.apiKeyPh': 'API Key',
    'models.ctxPh': '上下文窗口 (tokens)',
    'memory.saved': '記憶已儲存',
    'memory.configSaved': '配置已儲存',
    'memory.saveFailed': '儲存失敗',
    'memory.mode': '整合模式',
    'memory.modeHint': '記憶內容如何嵌入提示詞',
    'memory.modeAppend': '追加到系統提示詞後',
    'memory.modePrepend': '插入到系統提示詞前',
    'memory.modeSystem': '替換系統提示詞',
    'memory.modeNone': '不整合（僅手動引用）',
    'memory.maxTokens': '最大 Token 數',
    'memory.maxTokensHint': '記憶內容最大長度限制',
    'memory.template': '提示詞模板',
    'memory.templateHint': '用 {memory} 佔位符插入記憶內容',
    'memory.preview': '預覽效果',
    'memory.previewPlaceholder': '（記憶內容預覽）',
    'memory.previewNone': '記憶未整合到提示詞（僅手動引用）',
    'nav.skills': '技能',
    'nav.system': '系統',
    'nav.files': '文件',
    'nav.logs': '日誌',
    'nav.token': 'Token',
    'nav.gateway': '網關',
    'nav.globalSettings': '全局設置',
    'nav.language': '語言',
    'theme.title': '外觀設置',
    'theme.colors': '顏色設置',
    'theme.sizes': '尺寸設置',
    'theme.templates': '模板管理',
    'theme.saveTemplate': '儲存模板',
    'theme.loadTemplate': '加載',
    'theme.deleteTemplate': '刪除',
    'theme.exportTemplate': '導出',
    'theme.templateNamePh': '輸入模板名稱...',
    'theme.reset': '重設默認',
    'theme.export': '導出配置',
    'theme.import': '導入配置',
    'theme.saved': '模板已儲存',
    'theme.deleted': '模板已刪除',
    'theme.loaded': '模板已加載',
    'theme.resetDone': '已重設為默認主題',
    'theme.exportDone': '配置已複製到剪貼板',
    'theme.importDone': '配置已導入',
    'theme.presets': '預設主題：',
    'theme.presetLight': '青綠淺色',
    'theme.presetDark': 'GitHub 暗色',
    'theme.presetOcean': '海洋',
    'theme.presetSunset': '暖陽',
    'theme.presetForest': '森林',
    'theme.presetRose': '玫瑰',
    'theme.presetMidnight': '午夜',
    'theme.presetSakura': '櫻花',
    'theme.presetSlate': '石墨',
    'theme.presetBlack': '純黑',
    'theme.presetApplied': '預設主題已應用',
    // Global Settings
    'settings.title': '全局設置',
    'settings.save': '儲存設置',
    'settings.refresh': '刷新',
    'settings.reset': '重設默認',
    'settings.modelConfig': '模型配置',
    'settings.model': '模型名稱',
    'settings.provider': '服務商',
    'settings.baseUrl': 'API 地址',
    'settings.apiKey': 'API Key',
    'settings.contextWindow': '上下文窗口',
    'settings.systemParams': '系統參數',
    'settings.agentName': '智能體名稱',
    'settings.port': '服務端口',
    'settings.maxTools': '最大並發工具數',
    'settings.sessionTimeout': '會話超時 (秒)',
    'settings.logLevel': '日誌級別',
    'settings.appearance': '外觀設置',
    'settings.icon': '圖標',
    'settings.avatar': '頭像 URL',
    'settings.models': '多模型管理',
    'settings.addModel': '添加模型',
    'settings.defaultModel': '默認模型',
    'settings.saved': '設置已儲存',
    'settings.saveFailed': '儲存失敗：',
    'settings.loadFailed': '加載失敗：',
    'settings.resetDone': '已重設為默認值',
    'settings.modelAdded': '模型已添加',
    'settings.modelRemoved': '模型已刪除',
    'settings.confirmReset': '確定要重設所有設置為默認值嗎？',
    'settings.debug': 'Debug 模式',
    'settings.debugDesc': '在訊息下方顯示完整回應資料',
    'settings.systemParams': '🔧 系統參數',
    'settings.systemRuntime': '運行時',
    'settings.wsHeartbeatTimeout': 'WS 心跳超時 (秒)',
    'settings.wsHeartbeatTimeoutHint': '無訊息時斷開 WebSocket 連接的時間',
    'settings.sessionListLimit': '會話列表載入數',
    'settings.sessionListLimitHint': '會話列表頁面最多顯示的會話條數',
    'settings.logBufferSize': '日誌緩衝區大小',
    'settings.logBufferSizeHint': '記憶體中保留的日誌條數（影響記憶體佔用）',
    'settings.tokenUsageMax': 'Token 記錄上限',
    'settings.tokenUsageMaxHint': 'Token 用量歷史最大記錄數',
    'settings.ctxWindowDefault': '上下文窗口預設值',
    'settings.ctxWindowDefaultHint': 'models.json 中未指定 context_window 時的預設值',
    'settings.restartRequired': '✦ 修改後需重啟服務生效',
    'settings.resetDefaults': '重設預設',
    'settings.saveAndRestart': '儲存並重啟',
    'settings.systemParamsSaved': '系統參數已儲存，正在重啟...',
    'theme.importInvalid': '無效的配置',
    'theme.confirmDelete': '確定刪除模板 "{0}"?',
    'theme.noTemplates': '暫無儲存的模板',
    'theme.preview': '實時預覽',
    'theme.bg': '背景色',
    'theme.bgSidebar': '側邊欄背景',
    'theme.bgCard': '卡片背景',
    'theme.bgHover': '懸停背景',
    'theme.border': '邊框色',
    'theme.text': '主文本色',
    'theme.textDim': '次要文本色',
    'theme.accent': '強調色',
    'theme.accent2': '強調色2',
    'theme.green': '成功色',
    'theme.red': '錯誤色',
    'theme.yellow': '警告色',
    'theme.orange': '橙色',
    'theme.cyan': '青色',
    'theme.sidebarWidth': '側邊欄寬度',
    'theme.borderRadius': '圓角大小',
    'theme.fontSize': '字體大小',
    'theme.msgMaxWidth': '消息最大寬度',
    'theme.chatPadding': '聊天區邊距',
    'status.connected': '已連接',
    'status.disconnected': '未連接',
    'chat.placeholder': '輸入消息... (Enter 發送, Shift+Enter 換行, 粘貼圖片直接發送)',
    'chat.send': '發送',
    'chat.typing': 'AI 正在思考',
    'chat.connecting': '連接斷開，3秒後重連...',
    'chat.connected': 'WebSocket 已連線',
    'chat.disconnected': 'WebSocket 已斷線，3秒後重連',
    'chat.error': '錯誤:',
    // Log messages (addLog)
    'log.wsConnected': 'WebSocket 已連線',
    'log.wsDisconnected': 'WebSocket 已斷線，3秒後重連',
    'log.connection': '連線',
    'log.userMsg': '使用者',
    'log.gatewayControl': '閘道控制',
    'chat.switched': '已切換到會話:',
    'chat.newSession': '新會話已創建，發送消息開始對話',
    'sessions.title': '會話管理',
    'sessions.new': '+ 新會話',
    'sessions.refresh': '刷新',
    'sessions.clearAll': '清除全部',
    'sessions.empty': '暫無會話',
    'sessions.autoCreate': '發送消息後自動創建',
    'sessions.active': '活躍',
    'sessions.messages': '條消息',
    'sessions.newCreated': '新會話已創建，發送消息開始對話',
    'sessions.allCleared': '所有會話已清除',
    'sessions.confirmClear': '確定清除所有會話?',
    'sessions.confirmDelete': '確定刪除會話 ',
    'sessions.selectPrompt': '← 點擊會話查看消息',
    'sessions.openChat': '進入對話',
    'sessions.quickReply': '快速回覆...',
    'sessions.send': '發送',
    'chat.user': '用戶',
    'chat.agent': '智慧體',
    'chat.loading': '載入中...',
    'chat.truncateNotice': '僅顯示最新 {0} 條訊息',
    'tasks.title': '定時任務',
    'tasks.new': '+ 新建任務',
    'tasks.refresh': '刷新',
    'tasks.total': '總任務',
    'tasks.enabled': '已啟用',
    'tasks.totalRuns': '總執行',
    'tasks.empty': '暫無定時任務，點擊"新建任務"創建',
    'tasks.newTask': '新建任務',
    'tasks.editTask': '編輯任務',
    'tasks.taskName': '任務名稱 *',
    'tasks.taskNamePh': '例如：每日摘要',
    'tasks.cron': 'Cron 表達式 *',
    'tasks.prompt': '任務提示詞 * (AI 將執行此提示詞)',
    'tasks.promptPh': '輸入 AI 需要執行的任務描述...',
    'tasks.enable': '啟用任務',
    'tasks.cancel': '取消',
    'tasks.save': '儲存',
    'tasks.confirmDelete': '確定刪除此任務？',
    'tasks.triggered': '任務已觸發執行',
    'tasks.executed': '執行成功',
    'tasks.failed': '執行失敗',
    'tasks.noResponse': '(無響應)',
    'tasks.history': '執行歷史',
    'tasks.loadFailed': '加載失敗',
    'tasks.saveFailed': '儲存失敗:',
    'tasks.unknownError': '未知錯誤',
    'tasks.enterName': '請輸入任務名稱',
    'tasks.enterCron': '請輸入 cron 表達式',
    'tasks.enterPrompt': '請輸入任務提示詞',
    'tasks.deleteFailed': '刪除失敗:',
    'tasks.cronFields': '需要5個字段: 分 時 日 月 周',
    'tasks.everyMin': '每分鐘',
    'tasks.everyNMin': '每{0}分鐘',
    'memory.title': '記憶存儲',
    'memory.add': '+ 添加',
    'memory.refresh': '刷新',
    'memory.clearAll': '清除全部',
    'memory.count': ' 條',
    'memory.loading': '加載中...',
    'memory.empty': '暫無記憶數據',
    'memory.emptyHint': '點擊「+ 添加」按鈕添加記憶',
    'memory.loadFailed': '加載失敗',
    'memory.addTitle': '添加記憶',
    'memory.key': '鍵名',
    'memory.keyPh': '例如：user_name',
    'memory.value': '內容',
    'memory.valuePh': '輸入記憶內容...',
    'memory.cancel': '取消',
    'memory.save': '儲存',
    'memory.saveSuccess': '記憶已儲存',
    'memory.saveFailed': '儲存失敗:',
    'memory.confirmDelete': '確定刪除記憶 "{0}"?',
    'memory.deleteSuccess': '記憶已刪除',
    'memory.deleteFailed': '刪除失敗:',
    'memory.confirmClear': '確定清除所有記憶?',
    'memory.clearSuccess': '所有記憶已清除',
    'memory.clearFailed': '清除失敗:',
    'memory.enterKey': '請輸入鍵名',
    'memory.enterValue': '請輸入內容',
    'skills.title': '技能管理',
    'skills.refresh': '刷新',
    'skills.empty': '暫無可用技能',
    'skills.loadFailed': '加載失敗:',
    'logs.title': '系統日誌',
    'logs.refresh': '刷新',
    'logs.autoOff': '自動刷新: 關',
    'logs.autoOn': '自動刷新: 開',
    'logs.clear': '清空顯示',
    'logs.level': '級別:',
    'logs.source': '來源:',
    'logs.all': '全部',
    'logs.searchPh': '搜索關鍵詞...',
    'logs.perPage': '每頁:',
    'logs.empty': '暫無匹配日誌',
    'logs.cleared': '顯示已清空，刷新後恢復',
    'logs.loadFailed': '加載失敗:',
    'token.title': 'Token 用量',
    'token.refresh': '刷新',
    'token.ctxWindow': '上下文窗口',
    'token.used': '已用 Token',
    'token.recent': '最近請求',
    'token.time': '時間',
    'token.model': 'Model',
    'token.prompt': 'Prompt',
    'token.completion': 'Completion',
    'token.total': 'Total',
    'token.totalTokens': '總 Token',
    'token.totalCalls': '總調用',
    'token.avgTokens': '平均 Token',
    'token.maxTokens': '最大 Token',
    'token.ctxUsage': '上下文使用率',
    'token.noHistory': '暫無使用記錄',
    'gateway.title': '網關控制',
    'gateway.restartAll': '重啟全部',
    'gateway.refresh': '刷新',
    'gateway.confirmRestart': '確定重啟整個網關？這將中斷所有連接並重新加載。',
    'gateway.confirmStop': '確定停止 {0}？',
    'gateway.confirmAction': '確定要',
    'gateway.confirmRestartAll': '確定重啟全部服務？所有運行中的服務將短暫中斷。',
    'gateway.actionSuccess': '操作成功',
    'gateway.actionFailed': '操作失敗',
    'gateway.restarting': '網關正在重啟，請稍後重新連接…',
    'gateway.noData': '無服務數據',
    'gateway.loadFailed': '加載失敗:',
    'agent.title': '智能體配置',
    'agent.switch': '切換智能體',
    'agent.refresh': '刷新',
    'agent.available': '可用智能體',
    'agent.settings': '智能體設置',
    'agent.displayName': '顯示名稱',
    'agent.displayNameHint': '智能體在界面上的名稱',
    'agent.icon': '圖標 / Emoji',
    'agent.iconHint': '顯示在側邊欄和列表中',
    'agent.avatar': '頭像 URL',
    'agent.avatarHint': '可選，留空則使用圖標',
    'agent.maxTools': '最大並發工具數',
    'agent.maxToolsHint': '同時執行的工具上限',
    'agent.timeout': '會話超時 (秒)',
    'agent.timeoutHint': '空閒會話自動關閉時間',
    'agent.reset': '重設',
    'agent.saveSettings': '儲存設置',
    'agent.selectAgent': '選擇智能體...',
    'agent.tabAbout': '關於智能體',
    'agent.tabFiles': '智能體配置文件',
    'agent.tabModels': '🤖 模型配置',
    'agent.tabLimits': '⚡ 回覆限制',
    'agent.limits': '回覆限制',
    'agent.limitsLlm': 'LLM 呼叫',
    'agent.llmTimeout': '請求超時 (秒)',
    'agent.llmTimeoutHint': '單次 API 呼叫等待時間',
    'agent.llmMaxTokens': '最大輸出 Token',
    'agent.llmMaxTokensHint': '單次回覆最大長度',
    'agent.llmMaxRetries': '最大重試次數',
    'agent.llmMaxRetriesHint': '超時後自動重試輪數',
    'agent.limitsTool': '工具呼叫',
    'agent.maxToolRounds': '最大工具輪數',
    'agent.maxToolRoundsHint': '單條訊息最多工具呼叫輪次',
    'agent.maxTools': '最大並發工具數',
    'agent.maxToolsHint': '同時執行的工具上限',
    'agent.limitsSession': '會話',
    'agent.sessionTimeout': '會話超時 (秒)',
    'agent.sessionTimeoutHint': '空閒會話自動關閉時間',
    'agent.maxHistoryMessages': '歷史訊息載入數',
    'agent.maxHistoryMessagesHint': '每次載入的歷史訊息條數',
    'agent.limitsMemory': '記憶',
    'agent.memoryMaxTokens': '記憶最大 Token',
    'agent.memoryMaxTokensHint': '記憶整合到提示詞的最大長度',
    'agent.limitsSkill': '技能',
    'agent.skillPreFilterTopK': '技能預篩選 Top-K',
    'agent.skillPreFilterTopKHint': '預篩選返回的技能數量（影響匹配精度和提示詞長度）',
    'agent.autoSaveHint': '✦ 修改後自動儲存',
    'agent.resetLimits': '重設預設',
    'agent.limitsReset': '已重設為預設值',
    'agent.appearance': '外觀設置',
    'agent.runtime': '運行設置',
    'agent.msgFontSize': '消息字體大小',
    'agent.msgBg': '消息背景色',
    'agent.msgText': '消息文字顏色',
    'agent.msgBorder': '消息邊框顏色',
    'agent.models': '模型管理',
    'agent.modelsHint': '— 每個智能體可使用不同模型',
    'agent.addModel': '添加新模型',
    'agent.modelName': '模型名稱 (如 LongCat-2.0)',
    'agent.provider': 'Provider (如 longcat)',
    'agent.baseUrl': 'Base URL',
    'agent.apiKey': 'API Key',
    'agent.ctxWindow': '上下文窗口 (tokens)',
    'agent.addModelBtn': '添加模型',
    'agent.saveAllModels': '儲存所有模型',
    'agent.configFiles': '配置文件',
    'agent.saved': '智能體設置已儲存',
    'agent.modelSaved': '模型設置已儲存',
    'agent.saveFailed': '儲存失敗:',
    'agent.selectFirst': '請先選擇一個智能體',
    'agent.enterModelName': '請輸入模型名稱',
    'agent.modelExists': '模型名稱已存在',
    'agent.modelsSaved': '模型配置已儲存',
    'agent.fileSaved': '文件已儲存',
    'agent.fileSaveFailed': '儲存失敗:',
    'agent.switchSuccess': '已切換到智能體: ',
    'agent.switchFailed': '切換失敗:',
    'agent.noOther': '沒有其他可用的智能體',
    'agent.empty': '暫無可用智能體',
    'agent.loadFailed': '加載失敗:',
    'agent.loading': '加載中...',
    'files.title': '文件瀏覽器',
    'files.refresh': '刷新',
    'files.pathConvert': '路徑轉換',
    'files.windowsPath': 'Windows 路徑',
    'files.windowsPathHint': '輸入 Windows 或 WSL 路徑，自動轉換為 Linux 路徑',
    'files.convert': '轉換',
    'files.browse': '瀏覽',
    'files.up': '上級',
    'files.original': '原始:',
    'files.converted': '轉換:',
    'files.usePath': '使用此路徑瀏覽',
    'files.copyPath': '複製路徑',
    'files.dirBrowse': '目錄瀏覽',
    'files.pathPh': '輸入路徑 (支持 Windows 路徑自動轉換)',
    'files.pathWindowsPh': 'C:\\Users\\Gavin\\Desktop 或 \\wsl.localhost\\Ubuntu\\home',
    'files.empty': '空目錄',
    'files.loadError': 'Error:',
    'tools.viewCalls': ' 工具調用',
    'tools.noParams': '(無參數)',
    'tools.noResult': '(無結果)',
    'tools.truncated': '\n... (已截斷)',
    'tools.params': '參數',
    'tools.result': '結果',
    'time.justNow': '剛剛',
    'time.minAgo': '分鐘前',
    'time.hourAgo': '小時前',
    // Toast
    'toast.copied': '訊息已複製',
    'toast.copyFailed': '複製失敗',
    'toast.moved': '訊息已移動',
    'toast.refreshed': '已刷新',
    'toast.loadFailed': '載入失敗',
    'toast.selectFirst': '請先選擇一項',
    'toast.saved': '已儲存',
    'toast.saveFailed': '儲存失敗',
    'toast.unknownError': '未知錯誤',
    'toast.modelExists': '模型已存在',
    'toast.enterModelName': '請輸入模型名稱',
    'toast.modelsSaved': '模型配置已儲存',
    'toast.fileSaved': '文件已儲存',
    'toast.switchSuccess': '已切換到',
    'toast.switchFailed': '切換失敗',
    'toast.enterBaseUrl': '請輸入 Base URL',
    'toast.enterApiKey': '請輸入 API Key',
    'toast.modelAdded': '模型已添加',
    'toast.verifyFailed': '模型驗證失敗',
    'toast.modelSaved': '模型已儲存',
    'toast.resetDone': '已重設為預設值',
    'toast.refreshFailed': '刷新失敗',
    'toast.enterName': '請輸入名稱',
    'toast.enterCron': '請輸入 cron 表達式',
    'toast.enterPrompt': '請輸入任務提示詞',
    'toast.triggered': '任務已觸發執行',
    'toast.deleteFailed': '刪除失敗',
    'toast.cronFields': '需要5個字段: 分 時 日 月 周',
    // Page refresh/success toasts
    'sessions.refreshed': '會話已刷新',
    'sessions.refreshFailed': '會話刷新失敗',
    'logs.refreshed': '日誌已刷新',
    'memory.refreshed': '記憶已刷新',
    'settings.refreshed': '設置已刷新',
    'settings.refreshFailed': '設置刷新失敗',
    'settings.modelSaved': '模型已儲存',
    'skills.refreshed': '技能已刷新',
    'tasks.refreshed': '任務已刷新',
    'token.refreshed': 'Token 用量已刷新',
    'token.refreshFailed': 'Token 刷新失敗',
    'agent.selectConfigAgent': '選擇智能體...',
    'chat.copied': '訊息已複製',
    'chat.copyFailed': '複製失敗',
    'chat.noModels': '暫無可用模型',
    'chat.visionWarnTitle': '模型不支援圖片識別',
    'chat.visionWarnBody': '當前模型 {model} 不支援圖片識別，無法處理您發送的圖片。',
    'chat.visionWarnSwitch': '切換到支援圖片識別的模型：',
    'chat.visionWarnSwitchBtn': '切換',
    'chat.visionWarnNoModels': '當前沒有配置支援圖片識別的模型。',
    'chat.visionWarnHint': '請在「模型管理」中添加支援 vision 能力的模型（如 LongCat-2.0-Preview、deepseek-v4-flash 等）。',
    'chat.visionWarnClose': '關閉',
  },
};

let currentLang = localStorage.getItem('siper_lang') || 'zh';

function t(key, ...args) {
  let s = LANG[currentLang][key] || LANG['zh'][key] || key;
  if (args.length) {
    for (let i = 0; i < args.length; i++) {
      s = s.replace('{' + i + '}', args[i]);
    }
  }
  return s;
}

// ===== Notification sound =====
let _audioCtx = null;
function playReplySound() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    const now = ctx.currentTime;
    // Two-tone chime: C5 -> E5
    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.4);
    });
  } catch(e) {}
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('siper_lang', lang);
  const footerSel = document.getElementById('footerLangSelect');
  if (footerSel) footerSel.value = lang;
  applyLang();
  // Refresh logs to reflect new language
  if (typeof refreshLogs === 'function') refreshLogs();
}

function applyLang() {
  document.querySelectorAll('.nav-section-title').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll('.nav-item[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      // Preserve icon (first child span with emoji) and badge elements
      const icon = el.querySelector('span:first-child');
      const badge = el.querySelector('.badge');
      const iconHtml = icon ? icon.outerHTML : '';
      const badgeHtml = badge ? badge.outerHTML : '';
      el.innerHTML = iconHtml + ' ' + t(key) + badgeHtml;
    }
  });
  const sv = document.getElementById('sidebarVersion');
  if (sv) {
    fetch('/api/version').then(r => r.json()).then(d => {
      sv.textContent = d.version || 'v0.4.31';
    }).catch(() => { sv.textContent = 'v0.4.31'; });
  }
  const st = document.getElementById('statusText');
  if (st) st.textContent = st.classList.contains('connected') ? t('status.connected') : t('status.disconnected');
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key || key.includes('${')) return;
    if (el.classList.contains('nav-item')) return; // nav-item already handled above
    if (el.classList.contains('nav-section-title')) return; // already handled above
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = t(key);
    } else if (!el.querySelector('[data-i18n]')) {
      el.textContent = t(key);
    }
  });
  const te = document.getElementById('typing');
  if (te) {
    const textEl = te.querySelector('.typing-text');
    if (textEl) textEl.textContent = t('chat.typing');
  }
  const ba = document.getElementById('btnAutoRefresh');
  if (ba && typeof logState !== 'undefined') {
    ba.textContent = t('logs.auto' + (logState.autoRefresh ? 'On' : 'Off'));
  }
}

// ===== State =====
let ws = null;
let currentSession = null;  // null until first message sent
let currentPage = 'chat';
const tokenHistory = [];
let wsConnId = null;  // WebSocket connection ID from server
let agentAvatarUrl = '/api/avatar';  // Default agent avatar

// ===== Navigation =====
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    if (page) navigateToPage(page);
  });
});

// ===== Hash Router =====
function navigateToPage(page, skipHash) {
  if (!page) return;
  const navItem = document.querySelector('.nav-item[data-page="' + page + '"]');
  if (!navItem) return;
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  navItem.classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  currentPage = page;
  if (!skipHash) location.hash = page;
  if (page === 'theme-settings') showThemeSettings();
  if (page === 'global-settings') refreshGlobalSettings();
  if (page === 'chat') {
    const chatEl = document.getElementById('chatMessages');
    if (chatEl && !chatEl.children.length && currentSession !== null) { loadRecentSession(); }
  }
  if (page === 'sessions') {
    refreshSessions();
  }
  if (page === 'tasks') refreshTasks();
  if (page === 'memory') { populateMemoryAgentSelector(); refreshMemoryPage(); }
  if (page === 'models') { refreshModelsPage(); }
  if (page === 'skills') refreshSkills();
  if (page === 'logs') refreshLogs();
  if (page === 'token') refreshTokenStats();
  if (page === 'gateway') refreshGateway();
  if (page === 'agent-config') { refreshConfigAgentPanel(); loadAgentSettings(); }
  if (page === 'file-browser') { refreshFileList(); }
}

function restoreFromHash() {
  const hash = location.hash.slice(1);
  if (hash && hash !== 'chat') {
    navigateToPage(hash);
  }
}

window.addEventListener('hashchange', () => {
  const hash = location.hash.slice(1);
  if (hash && hash !== currentPage) {
    navigateToPage(hash);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  // Sync theme palette trigger on load
  try {
    const saved = localStorage.getItem('siper_theme');
    if (saved) {
      const theme = JSON.parse(saved);
      if (theme._preset) updateThemePaletteTrigger(theme._preset);
    }
  } catch(e) {}
  // SPA mode: use hash-based routing
  const pgHash = location.hash.slice(1);
  const pageToShow = pgHash && pgHash !== 'chat' ? pgHash : null;
  if (pageToShow) {
    navigateToPage(pageToShow, true);
  } else {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const chatNav = document.querySelector('.nav-item[data-page="chat"]');
    if (chatNav) chatNav.classList.add('active');
    document.getElementById('page-chat').classList.add('active');
    currentPage = 'chat';
  }
  // Close sidebar settings panel when clicking outside
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('sidebarSettingsPanel');
    const btn = document.getElementById('sidebarSettingsToggle');
    if (!panel || !panel.classList.contains('open')) return;
    if (!panel.contains(e.target) && !btn.contains(e.target)) {
      panel.classList.remove('open');
      btn.classList.remove('active');
    }
  });

  // Initialize Mermaid
  if (window.mermaid) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: 'inherit'
    });
  }});

// ===== Connection Status =====
function setConnected(connected) {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  const wrap = document.getElementById('sidebarStatus');
  if (dot) dot.classList.toggle('connected', connected);
  if (txt) {
    txt.textContent = connected ? t('status.connected') : t('status.disconnected');
    txt.classList.toggle('connected', connected);
  }
  if (wrap) wrap.classList.toggle('connected', connected);
}

// ===== WebSocket =====
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsPort = parseInt(location.port) + 1;
  const wsUrl = `${proto}//${location.hostname}:${wsPort}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    setConnected(true);
    addLog('info', t('log.wsConnected'), currentLang);
    // Auto-create new session on first connect if no session exists
    if (!currentSession && currentPage === 'chat') {
      ws.send(JSON.stringify({ type: 'new_session' }));
    }
  };
  ws.onclose = (e) => {
    setConnected(false);
    const _te = document.getElementById('typing');
    if (_te) _te.className = 'typing';
    // Reset send state on disconnect
    isSending = false;
    const _sb = document.getElementById('sendBtn');
    const _stb = document.getElementById('stopBtn');
    if (_sb) _sb.disabled = false;
    if (_stb) _stb.classList.add('hidden');
    addLog('warn', t('chat.disconnected'), currentLang);
    setTimeout(connectWS, 3000);
  };
  ws.onerror = () => {};
  // ===== Streaming state (aggregated: all deltas → single bubble) =====
  let _streamAcc = '';
  let _streamBubble = null;
  let _streamRow = null;
  let _streamRawData = null;

  ws.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d.type === 'stream_delta') {
        _streamAcc += d.delta || '';
        const chatEl = document.getElementById('chatMessages');
        if (!chatEl) return;
        if (!_streamBubble) {
          _streamRow = document.createElement('div');
          _streamRow.className = 'msg-row agent msg-row-horizontal';
          const avatarWrap = document.createElement('div');
          avatarWrap.className = 'msg-avatar-wrap';
          avatarWrap.innerHTML = getAvatarHtml('agent');
          _streamBubbleWrap = document.createElement('div');
          _streamBubbleWrap.className = 'msg agent-bubble';
          _streamBubble = document.createElement('div');
          _streamBubble.className = 'msg-body';
          _streamBubbleWrap.appendChild(_streamBubble);
          _streamRow.appendChild(avatarWrap);
          _streamRow.appendChild(_streamBubbleWrap);
          chatEl.appendChild(_streamRow);
        }
        // Real-time markdown render: clear and re-render accumulated text
        _streamBubble.textContent = '';
        _streamBubble.appendChild(renderMarkdown(_streamAcc));
        chatEl.scrollTop = chatEl.scrollHeight;
      } else if (d.type === 'stream_end') {
        const _data = (d.data || {});
        const _usage = _data.usage;
        const _tools_used = _data.tool_calls_executed;
        const _tool_call_steps = _data.tool_call_steps || [];
        const _skills_active = _data.skills_active;
        const _skills_used = _data.skills_used || [];
        const _skills_recommended = _data.skills_recommended || [];
        const _processing_time_ms = _data.processing_time_ms;
        const _model = _data.model;
        const _attachments = _data.attachments || [];
        const _success = _data.success !== false;
        // Save raw data for debug display
        _streamRawData = _data;
        // If response is empty and no attachments, skip rendering (air bubble fix)
        if (!_streamAcc.trim() && _attachments.length === 0) {
          // Reset streaming state without rendering
          _streamAcc = '';
          _streamBubble = null;
          _streamBubbleWrap = null;
          _streamRow = null;
          isSending = false;
          const _sb = document.getElementById('sendBtn');
          const _stb = document.getElementById('stopBtn');
          if (_sb) _sb.disabled = false;
          if (_stb) _stb.classList.add('hidden');
          return;
        }
        // If success=false and there is stream text, show error styling on the bubble
        if (!_success && _streamBubbleWrap) {
          _streamBubbleWrap.classList.add('msg-error');
        }
        // Replace stream bubble content with rendered Markdown
        if (_streamBubble) {
          try {
            _streamBubble.textContent = '';
            _streamBubble.appendChild(renderMarkdown(_streamAcc));
          } catch(e) {
            console.error('[stream_end] renderMarkdown error:', e);
            _streamBubble.textContent = _streamAcc;
          }
        }
        // Add actions-below to the streamed message
        if (_streamRow && _streamBubbleWrap) {
          try {
            const actions = document.createElement('div');
            actions.className = 'msg-actions-below';
            // Copy button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'msg-action-btn';
            copyBtn.innerHTML = '📋';
            copyBtn.title = '复制内容';
            copyBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(_streamAcc).then(() => {
                copyBtn.innerHTML = '✓';
                setTimeout(() => copyBtn.innerHTML = '📋', 1500);
              });
            });
            actions.appendChild(copyBtn);
            // Insert button
            const insertBtn = document.createElement('button');
            insertBtn.className = 'msg-action-btn';
            insertBtn.innerHTML = '↩';
            insertBtn.title = '填入输入框';
            insertBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              const input = document.getElementById('chatInput');
              if (input) {
                input.value = _streamAcc;
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 262) + 'px';
                input.focus();
              }
            });
            actions.appendChild(insertBtn);
            // Dict button — show full response dict (only for successful responses)
            if (_success) {
              const dictBtn = document.createElement('button');
              dictBtn.className = 'msg-action-btn';
              dictBtn.innerHTML = '{}';
              dictBtn.title = 'dict';
              dictBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showDictModal(_data);
              });
              actions.appendChild(dictBtn);
            }
            _streamRow.appendChild(actions);
          } catch(e) {}
        }
        // Render meta (tokens, tools, etc.) on the streamed message
        if (_streamBubbleWrap) {
          try {
            const _metaCfg = getMetaConfig();
            const _meta = {
              usage: _usage,
              tools_used: _tools_used,
              tool_call_steps: _tool_call_steps,
              skills_active: _skills_active,
              skills_used: _skills_used,
              skills_recommended: _skills_recommended,
              processing_time_ms: _processing_time_ms,
            };
            // Only attach raw data for successful responses
            if (_success) _meta._raw = _data;
            if (_data.attachments) _meta.attachments = _data.attachments;
            appendMeta(_streamBubbleWrap, _meta);
          } catch(e) {}
        }
        // Reset streaming state
        _streamAcc = '';
        _streamBubble = null;
        _streamBubbleWrap = null;
        _streamRow = null;
        isSending = false;
        // Post-render enhancements (code highlight, mermaid, katex)
        if (_streamBubbleWrap && _streamBubble) {
          try { postRenderEnhance(_streamBubble); } catch(e) {}
        }
        const _sb = document.getElementById('sendBtn');
        const _stb = document.getElementById('stopBtn');
        if (_sb) _sb.disabled = false;
        if (_stb) _stb.classList.add('hidden');
        playReplySound();
        // Render attachments on the last streamed message
        if (_attachments.length > 0) {
          try {
            const chatEl = document.getElementById('chatMessages');
            if (chatEl) {
              const rows = chatEl.querySelectorAll('.msg-row.agent');
              if (rows.length > 0) {
                const lastRow = rows[rows.length - 1];
                const bubble = lastRow.querySelector('.msg-body');
                if (bubble) {
                  let attHtml = '<div class="msg-attachments">';
                  for (const att of _attachments) {
                    if (att.category === 'image' || att.type === 'image') {
                      const src = att.url || att.data || '';
                      const alt = escapeHtml(att.name || att.filename || 'image');
                      attHtml += `<img src="${src}" class="chat-image" alt="${alt}" onclick="window.open(this.src)">`;
                    } else {
                      const icon = FILE_ICONS[att.category] || FILE_ICONS.other;
                      const name = escapeHtml(att.name || att.filename || att.url || 'file');
                      attHtml += `<div class="chat-file-ref">${icon} ${name}</div>`;
                    }
                  }
                  attHtml += '</div>';
                  const attWrap = document.createElement('div');
                  attWrap.innerHTML = attHtml;
                  bubble.appendChild(attWrap);
                }
              }
            }
          } catch(e) {}
        }
        // Render TTS audio bar on the last agent message
        renderTtsAudioBars(_tool_call_steps);
        // Debug: append raw data block to the last agent bubble
        if (_streamRawData) {
          try {
            const cfg = getMetaConfig();
            if (cfg.showDebug) {
              const chatEl = document.getElementById('chatMessages');
              if (chatEl) {
                const rows = chatEl.querySelectorAll('.msg-row.agent');
                if (rows.length > 0) {
                  const lastRow = rows[rows.length - 1];
                  const bubble = lastRow.querySelector('.msg-body');
                  if (bubble) {
                    const dbg = document.createElement('div');
                    dbg.className = 'msg-debug-block';
                    // Header with copy button
                    const hdr = document.createElement('div');
                    hdr.className = 'msg-debug-header';
                    const title = document.createElement('span');
                    title.className = 'msg-debug-title';
                    title.textContent = '🔍 Response';
                    hdr.appendChild(title);
                    let rawJson = '';
                    try { rawJson = JSON.stringify(_streamRawData, null, 2); } catch(e) { rawJson = String(_streamRawData); }
                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'msg-debug-copy';
                    copyBtn.textContent = '📋';
                    copyBtn.title = '复制 JSON';
                    copyBtn.addEventListener('click', () => {
                      navigator.clipboard.writeText(rawJson).then(() => {
                        copyBtn.textContent = '✓';
                        setTimeout(() => copyBtn.textContent = '📋', 1500);
                      });
                    });
                    hdr.appendChild(copyBtn);
                    dbg.appendChild(hdr);
                    // Highlighted pre
                    const pre = document.createElement('pre');
                    pre.className = 'msg-debug-pre';
                    pre.innerHTML = debugHighlight(rawJson);
                    dbg.appendChild(pre);
                    bubble.appendChild(dbg);
                  }
                }
              }
            }
          } catch(e) {}
          _streamRawData = null;
        }
        // Update token usage
        if (_usage) {
          tokenHistory.push({
            time: new Date().toLocaleTimeString(),
            model: _model || 'LongCat-2.0-Preview',
            prompt: _usage.prompt_tokens || 0,
            completion: _usage.completion_tokens || 0,
            total: _usage.total_tokens || 0
          });
          if (tokenHistory.length > 50) tokenHistory.shift();
          if (currentPage === 'token') refreshTokenStats();
        }
        // Hide typing indicator after all rendering is complete
        const _te = document.getElementById('typing');
        if (_te) _te.className = 'typing';
        // Clear tool progress panel
        const _tt = document.getElementById('typingTools');
        if (_tt) _tt.innerHTML = '';
      } else if (d.type === 'connected') {
        wsConnId = d.connection_id;
        if (!currentSession) {
          currentSession = d.session_id || wsConnId;
        }
        addLog('info', t('log.connection') + ': ' + d.connection_id, currentLang);
        // Don't auto-load recent session on connect — history loading is heavy
        // (100 messages, renderMarkdown each) and blocks the main thread.
        // User can click a session in the sidebar to load history manually.
        // loadRecentSession();
      } else if (d.type === 'session_created') {
        currentSession = d.session_id;
        addLog('info', '新会话已创建：' + d.session_id, currentLang);
        // Clear chat area for new session
        const chatEl = document.getElementById('chatMessages');
        if (chatEl) chatEl.innerHTML = '';
      } else if (d.type === 'tool_progress') {
        // Clear any streamed text from the first LLM call when tool execution starts,
        // so that only the final response after tool execution is shown in the bubble.
        if (d.status === 'running') {
          _streamAcc = '';
          if (_streamBubble) _streamBubble.textContent = '';
        }
        // Show tool execution progress inside the typing indicator area
        const typingTools = document.getElementById('typingTools');
        if (typingTools) {
          const toolName = d.tool_name || 'unknown';
          const status = d.status || 'running';
          const callId = d.call_id || toolName;
          // Find existing step by call_id (unique per invocation, not merged by name)
          let step = typingTools.querySelector('[data-call-id="' + callId + '"]');
          if (!step) {
            step = document.createElement('div');
            step.setAttribute('data-call-id', callId);
            step.setAttribute('data-tool', toolName);
            typingTools.appendChild(step);
            // Keep only the latest 10 tool steps
            while (typingTools.children.length > 10) {
              typingTools.removeChild(typingTools.firstChild);
            }
          }
          step.className = 'typing-tool-step';
          const icon = status === 'completed' ? '✓' : status === 'failed' ? '✗' : '⟳';
          const statusClass = status === 'completed' ? 'tool-step-done' : status === 'failed' ? 'tool-step-error' : 'tool-step-running';
          // Build param summary from info (no truncation)
          let paramSummary = '';
          if (d.info && d.info.parameters) {
            const params = d.info.parameters;
            if (toolName === 'web_search' && params.query) {
              paramSummary = '("' + params.query + '")';
            } else if (toolName === 'web_extract' && params.urls) {
              paramSummary = '(' + (Array.isArray(params.urls) ? params.urls.length : 1) + ' urls)';
            } else if (toolName === 'execute_code') {
              paramSummary = '(code)';
            } else if (toolName === 'read_file' && params.path) {
              paramSummary = '("' + params.path + '")';
            } else if (toolName === 'write_file' && params.path) {
              paramSummary = '("' + params.path + '")';
            } else if (toolName === 'patch' && params.path) {
              paramSummary = '("' + params.path + '")';
            } else if (toolName === 'skill_view' && params.name) {
              paramSummary = '("' + params.name + '")';
            } else {
              paramSummary = '(' + Object.keys(params).join(', ') + ')';
            }
          }
          // Result summary for completed (no truncation)
          let resultSummary = '';
          if (status === 'completed' && d.info) {
            if (toolName === 'web_search' && d.info.metadata && d.info.metadata.count) {
              resultSummary = ' → ' + d.info.metadata.count + ' results';
            } else if (d.info.result && typeof d.info.result === 'string') {
              const r = d.info.result.replace(/\n/g, ' ');
              resultSummary = ' → ' + r;
            }
          }
          step.innerHTML = '<span class="tool-step-icon ' + statusClass + '">' + icon + '</span>' +
            '<span class="tool-step-name">' + escapeHtml(toolName + paramSummary) + '</span>' +
            '<span class="tool-step-result-summary">' + escapeHtml(resultSummary) + '</span>';
          // Auto-scroll chat to keep typing area visible
          const chatEl = document.getElementById('chatMessages');
          if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
        }
      } else if (d.type === 'stopped') {
        // Generation was cancelled by user
        isSending = false;
        const _sb = document.getElementById('sendBtn');
        const _stb = document.getElementById('stopBtn');
        if (_sb) _sb.disabled = false;
        if (_stb) _stb.classList.add('hidden');
        const _te = document.getElementById('typing');
        if (_te) _te.className = 'typing';
        const _tt = document.getElementById('typingTools');
        if (_tt) _tt.innerHTML = '';
        if (_streamBubble && _streamRow && _streamBubbleWrap) {
          // Ensure final MD render of accumulated text
          _streamBubble.textContent = '';
          _streamBubble.appendChild(renderMarkdown(_streamAcc));
          // Add action buttons
          try {
            const actions = document.createElement('div');
            actions.className = 'msg-actions-below';
            const copyBtn = document.createElement('button');
            copyBtn.className = 'msg-action-btn';
            copyBtn.innerHTML = '📋';
            copyBtn.title = '复制内容';
            copyBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(_streamAcc).then(() => {
                copyBtn.innerHTML = '✓';
                setTimeout(() => copyBtn.innerHTML = '📋', 1500);
              });
            });
            actions.appendChild(copyBtn);
            const insertBtn = document.createElement('button');
            insertBtn.className = 'msg-action-btn';
            insertBtn.innerHTML = '↩';
            insertBtn.title = '填入输入框';
            insertBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              const input = document.getElementById('chatInput');
              if (input) {
                input.value = _streamAcc;
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 262) + 'px';
                input.focus();
              }
            });
            actions.appendChild(insertBtn);
            _streamRow.appendChild(actions);
          } catch(e) {}
        }
        // Reset streaming state
        _streamAcc = '';
        _streamBubble = null;
        _streamBubbleWrap = null;
        _streamRow = null;
      } else if (d.type === 'response') {
        isSending = false;
        const _sb2 = document.getElementById('sendBtn');
        const _stb2 = document.getElementById('stopBtn');
        if (_sb2) _sb2.disabled = false;
        if (_stb2) _stb2.classList.add('hidden');
        if (d.session_id) currentSession = d.session_id;
        const _data = d.data || {};
        const _content = _data.response || _data.content || '';
        const _success = _data.success !== false;
        const _usage = _data.usage;
        const _tools_used = _data.tool_calls_executed;
        const _tool_call_steps = _data.tool_call_steps || [];
        const _skills_active = _data.skills_active;
        const _skills_used = _data.skills_used || [];
        const _skills_recommended = _data.skills_recommended || [];
        const _processing_time_ms = _data.processing_time_ms;
        const _model = _data.model;
        const _prompt_context = _data.prompt_context;
        if (!_success) {
          addMsg(_content || '服务暂时没有响应，请重试', 'error');
        } else if (!_content.trim() && !_data.attachments) {
          // Empty response with no attachments — skip rendering (air bubble fix)
        } else {
          const meta = {
            usage: _usage,
            tools_used: _tools_used,
            tool_call_steps: _tool_call_steps,
            skills_active: _skills_active,
            processing_time_ms: _processing_time_ms,
            _raw: _data,
          };
          if (_data.attachments) meta.attachments = _data.attachments;
          addMsg(_content, 'agent', meta);
        }
        playReplySound();
        // Render TTS audio bar for non-streaming response
        renderTtsAudioBars(_tool_call_steps);
        if (_usage) {
          tokenHistory.push({
            time: new Date().toLocaleTimeString(),
            model: _model || 'LongCat-2.0-Preview',
            prompt: _usage.prompt_tokens || 0,
            completion: _usage.completion_tokens || 0,
            total: _usage.total_tokens || 0
          });
          if (tokenHistory.length > 50) tokenHistory.shift();
          if (currentPage === 'token') refreshTokenStats();
        }
        if (_prompt_context) {
          try {
            const chatEl = document.getElementById('chatMessages');
            if (chatEl) {
              const rows = chatEl.querySelectorAll('.msg-row.user');
              if (rows.length > 0) {
                rows[rows.length - 1].setAttribute('data-prompt-context', _prompt_context);
              }
            }
          } catch(e) {}
        }
        // Hide typing indicator after all rendering is complete
        const _te2 = document.getElementById('typing');
        if (_te2) _te2.className = 'typing';
      } else if (d.type === 'error') {
        isSending = false;
        const _sb3 = document.getElementById('sendBtn');
        const _stb3 = document.getElementById('stopBtn');
        if (_sb3) _sb3.disabled = false;
        if (_stb3) _stb3.classList.add('hidden');
        const _te = document.getElementById('typing');
        if (_te) _te.className = 'typing';
        const _tt = document.getElementById('typingTools');
        if (_tt) _tt.innerHTML = '';
        // Reset streaming state on error
        _streamAcc = '';
        _streamBubble = null;
        _streamBubbleWrap = null;
        _streamRow = null;
        addMsg(t('chat.error') + d.message, 'error');
        addLog('error', d.message, currentLang);
      }
    } catch (err) {
      // Ensure isSending is reset on any unhandled error
      isSending = false;
      const _sb = document.getElementById('sendBtn');
      const _stb = document.getElementById('stopBtn');
      if (_sb) _sb.disabled = false;
      if (_stb) _stb.classList.add('hidden');
      const _te = document.getElementById('typing');
      if (_te) _te.className = 'typing';
      console.error('[ws.onmessage] unhandled error:', err);
    }
  };
}


// ===== Log helpers =====
// Load the most recent session with messages into the chat view
async function loadRecentSession() {
  try {
    const r = await fetch('/api/sessions');
    const data = await r.json();
    if (!data.sessions || !data.sessions.length) return;
    const sorted = data.sessions
      .filter(s => s.active === true && s.messages > 0)
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    if (!sorted.length) return;
    const latest = sorted[0];
    // Only switch UI to chat page if user is already on chat page
    // On non-chat pages (logs, sessions, etc.) just update currentSession silently
    if (currentPage === 'chat') {
      // Don't overwrite chat if user already has messages displayed
      const chatEl = document.getElementById('chatMessages');
      if (chatEl && chatEl.children.length > 0) return;
      currentSession = latest.session_id;
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      document.querySelector('[data-page="chat"]').classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-chat').classList.add('active');
      await loadSessionHistory(currentSession);
    } else {
      currentSession = latest.session_id;
    }
  } catch(e) { console.error('loadRecentSession error:', e); }
}
function addLog(level, message, lang) {
  const list = document.getElementById('logsList');
  if (!list) return;
  const div = document.createElement('div');
  div.className = 'log-entry ' + (level || 'info');
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  div.innerHTML = `<span class="time">${time}</span>${escapeHtml(message || '')}`;
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}


// ===== Utility Functions =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Auth (已禁用认证) =====



// ===== Sidebar System Settings Modal =====
function toggleSidebarSettings() {
  const overlay = document.getElementById('settingsModalOverlay');
  const btn = document.getElementById('sidebarSettingsToggle');
  if (!overlay) return;
  const isOpen = overlay.classList.contains('open');
  if (isOpen) {
    overlay.classList.remove('open');
    if (btn) btn.classList.remove('active');
  } else {
    overlay.classList.add('open');
    if (btn) btn.classList.add('active');
    loadSidebarSettings();
  }
}

function loadSidebarSettings() {
  // Load meta display config
  if (typeof loadMetaConfig === 'function') loadMetaConfig();
  // Update theme palette trigger
  try {
    const saved = localStorage.getItem('siper_theme');
    if (saved) {
      const theme = JSON.parse(saved);
      if (theme._preset) updateThemePaletteTrigger(theme._preset);
    }
  } catch(e) {}
}

function applySidebarTheme(presetKey) {
  const presets = {
    light: {
      '--bg': '#c8ebe5', '--bg-sidebar': '#b8ddd6', '--bg-card': '#ddf0ec',
      '--bg-hover': '#a8d5cc', '--border': '#8bbfb5', '--text': '#0a1f1a',
      '--text-dim': '#3a6b5e', '--accent': '#2d9e8a', '--accent2': '#6b5ca8',
      '--green': '#2d9e6a', '--red': '#c0392b', '--yellow': '#b7950b',
      '--orange': '#ca6f1e', '--cyan': '#1abc9c',
      '--agent-msg-bg': '#ddf0ec', '--agent-msg-border': '#8bbfb5', '--agent-msg-text': '#0a1f1a',
      '--user-msg-bg': '#2d9e8a', '--user-msg-text': '#ffffff',
    },
    dark: {
      '--bg': '#0d1117', '--bg-sidebar': '#161b22', '--bg-card': '#1c2333',
      '--bg-hover': '#242d3d', '--border': '#30363d', '--text': '#e6edf3',
      '--text-dim': '#8b949e', '--accent': '#58a6ff', '--accent2': '#a371f7',
      '--green': '#3fb950', '--red': '#f85149', '--yellow': '#d29922',
      '--orange': '#f0883e', '--cyan': '#39d2c0',
      '--agent-msg-bg': '#1c2333', '--agent-msg-border': '#30363d', '--agent-msg-text': '#e6edf3',
      '--user-msg-bg': '#1a3a5c', '--user-msg-text': '#cce0ff',
    },
    sunset: {
      '--bg': '#fefae0', '--bg-sidebar': '#faedcd', '--bg-card': '#fefae0',
      '--bg-hover': '#e9c46a', '--border': '#dda15e', '--text': '#3a2d1e',
      '--text-dim': '#8b6f47', '--accent': '#e63946', '--accent2': '#f4a261',
      '--green': '#2a9d8f', '--red': '#e63946', '--yellow': '#e9c46a',
      '--orange': '#f4a261', '--cyan': '#48cae4',
      '--agent-msg-bg': '#faedcd', '--agent-msg-border': '#dda15e', '--agent-msg-text': '#3a2d1e',
      '--user-msg-bg': '#e63946', '--user-msg-text': '#ffffff',
    },
    forest: {
      '--bg': '#1b4332', '--bg-sidebar': '#0b2618', '--bg-card': '#2d6a4f',
      '--bg-hover': '#40916c', '--border': '#52b788', '--text': '#d8f3dc',
      '--text-dim': '#95d5b2', '--accent': '#40916c', '--accent2': '#74c69d',
      '--green': '#52b788', '--red': '#e63946', '--yellow': '#ffd166',
      '--orange': '#f4a261', '--cyan': '#48cae4',
      '--agent-msg-bg': '#2d6a4f', '--agent-msg-border': '#52b788', '--agent-msg-text': '#d8f3dc',
      '--user-msg-bg': '#40916c', '--user-msg-text': '#ffffff',
    },
    rose: {
      '--bg': '#fff0f3', '--bg-sidebar': '#ffe3e8', '--bg-card': '#fff0f3',
      '--bg-hover': '#ffc2d1', '--border': '#ffb3c6', '--text': '#3a0ca3',
      '--text-dim': '#7209b7', '--accent': '#e85d75', '--accent2': '#f72585',
      '--green': '#4cc9f0', '--red': '#f72585', '--yellow': '#ffd166',
      '--orange': '#ff9e00', '--cyan': '#4cc9f0',
      '--agent-msg-bg': '#ffe3e8', '--agent-msg-border': '#ffb3c6', '--agent-msg-text': '#3a0ca3',
      '--user-msg-bg': '#e85d75', '--user-msg-text': '#ffffff',
    },
    midnight: {
      '--bg': '#0a0a1a', '--bg-sidebar': '#12122a', '--bg-card': '#1a1a3e',
      '--bg-hover': '#2a2a5e', '--border': '#3a3a7e', '--text': '#e0e0ff',
      '--text-dim': '#9090cc', '--accent': '#7b2ff7', '--accent2': '#c77dff',
      '--green': '#06d6a0', '--red': '#ef476f', '--yellow': '#ffd166',
      '--orange': '#ff9e00', '--cyan': '#06d6a0',
      '--agent-msg-bg': '#1a1a3e', '--agent-msg-border': '#3a3a7e', '--agent-msg-text': '#e0e0ff',
      '--user-msg-bg': '#2a1a5e', '--user-msg-text': '#e0e0ff',
    },
    sakura: {
      '--bg': '#fff5f8', '--bg-sidebar': '#ffe8f0', '--bg-card': '#fff0f5',
      '--bg-hover': '#ffd6e8', '--border': '#ffb3d9', '--text': '#4a1942',
      '--text-dim': '#8b4b76', '--accent': '#ff69b4', '--accent2': '#c9184a',
      '--green': '#52b788', '--red': '#c9184a', '--yellow': '#ffd166',
      '--orange': '#ff9e00', '--cyan': '#48cae4',
      '--agent-msg-bg': '#ffe8f0', '--agent-msg-border': '#ffb3d9', '--agent-msg-text': '#4a1942',
      '--user-msg-bg': '#ff69b4', '--user-msg-text': '#ffffff',
    },
    slate: {
      '--bg': '#1e293b', '--bg-sidebar': '#0f172a', '--bg-card': '#334155',
      '--bg-hover': '#475569', '--border': '#64748b', '--text': '#e2e8f0',
      '--text-dim': '#94a3b8', '--accent': '#475569', '--accent2': '#64748b',
      '--green': '#10b981', '--red': '#ef4444', '--yellow': '#f59e0b',
      '--orange': '#f97316', '--cyan': '#06b6d4',
      '--agent-msg-bg': '#334155', '--agent-msg-border': '#64748b', '--agent-msg-text': '#e2e8f0',
      '--user-msg-bg': '#475569', '--user-msg-text': '#ffffff',
    },
    black: {
      '--bg': '#000000', '--bg-sidebar': '#0a0a0a', '--bg-card': '#141414',
      '--bg-hover': '#1f1f1f', '--border': '#2a2a2a', '--text': '#e5e5e5',
      '--text-dim': '#737373', '--accent': '#3b82f6', '--accent2': '#60a5fa',
      '--green': '#22c55e', '--red': '#ef4444', '--yellow': '#eab308',
      '--orange': '#f97316', '--cyan': '#06b6d4',
      '--agent-msg-bg': '#141414', '--agent-msg-border': '#2a2a2a', '--agent-msg-text': '#e5e5e5',
      '--user-msg-bg': '#1e3a5f', '--user-msg-text': '#dbeafe',
    },
  };
  const preset = presets[presetKey];
  if (!preset) return;
  Object.keys(preset).forEach(k => document.documentElement.style.setProperty(k, preset[k]));
  // Save to localStorage
  const saved = {};
  Object.keys(preset).forEach(k => saved[k] = preset[k]);
  saved._preset = presetKey;
  localStorage.setItem('siper_theme', JSON.stringify(saved));
  // Sync theme palette trigger
  updateThemePaletteTrigger(presetKey);
  // Notify ECharts to re-render with new theme
  document.documentElement.dispatchEvent(new CustomEvent('siper-theme-changed'));
}

// ===== ECharts theme sync =====
// (listener set up in page-token.js)

// ===== Theme Palette (sidebar footer) =====
const PALETTE_PRESETS = {
  light:  { label: '青绿', accent: '#2d9e8a', bg: '#c8ebe5', sidebar: '#b8ddd6' },
  dark:   { label: '深蓝', accent: '#58a6ff', bg: '#0d1117', sidebar: '#161b22' },
  sunset: { label: '暖阳', accent: '#e63946', bg: '#fefae0', sidebar: '#faedcd' },
  forest: { label: '森林', accent: '#40916c', bg: '#1b4332', sidebar: '#0b2618' },
  rose:   { label: '玫瑰', accent: '#e85d75', bg: '#fff0f3', sidebar: '#ffe3e8' },
  midnight:{ label: '午夜', accent: '#7b2ff7', bg: '#0a0a1a', sidebar: '#12122a' },
  sakura: { label: '樱花', accent: '#ff69b4', bg: '#fff5f8', sidebar: '#ffe8f0' },
  slate:  { label: '石墨', accent: '#475569', bg: '#1e293b', sidebar: '#0f172a' },
  black:  { label: '纯黑', accent: '#3b82f6', bg: '#000000', sidebar: '#0a0a0a' },
};

function updateThemePaletteTrigger(presetKey) {
  const trigger = document.getElementById('themePaletteTrigger');
  const preset = PALETTE_PRESETS[presetKey];
  if (trigger && preset) {
    trigger.style.background = `linear-gradient(135deg, ${preset.bg} 33%, ${preset.accent} 33% 66%, ${preset.sidebar} 66%)`;
    trigger.title = preset.label;
  }
}

function buildThemePaletteMenu() {
  const menu = document.getElementById('themePaletteMenu');
  if (!menu) return;
  menu.innerHTML = '';
  Object.keys(PALETTE_PRESETS).forEach(key => {
    const preset = PALETTE_PRESETS[key];
    const item = document.createElement('div');
    item.className = 'theme-palette-item';
    item.dataset.key = key;
    const swatch = document.createElement('span');
    swatch.className = 'theme-palette-swatch';
    swatch.style.background = `linear-gradient(135deg, ${preset.bg} 33%, ${preset.accent} 33% 66%, ${preset.sidebar} 66%)`;
    item.appendChild(swatch);
    const label = document.createElement('span');
    label.textContent = preset.label;
    item.appendChild(label);
    item.onclick = () => { applySidebarTheme(key); closeThemePalette(); };
    menu.appendChild(item);
  });
}

function toggleThemePalette() {
  const menu = document.getElementById('themePaletteMenu');
  if (!menu) return;
  if (menu.classList.contains('open')) {
    closeThemePalette();
  } else {
    buildThemePaletteMenu();
    // Highlight current
    let currentKey = '';
    try { currentKey = JSON.parse(localStorage.getItem('siper_theme') || '{}')._preset || ''; } catch(e) {}
    menu.querySelectorAll('.theme-palette-item').forEach(item => {
      item.classList.toggle('active', item.dataset.key === currentKey);
    });
    menu.classList.add('open');
  }
}

function closeThemePalette() {
  const menu = document.getElementById('themePaletteMenu');
  if (menu) menu.classList.remove('open');
}

// Close palette on outside click
document.addEventListener('click', (e) => {
  const palette = document.getElementById('themePalette');
  if (palette && !palette.contains(e.target)) closeThemePalette();
});


function resetSidebarSettings() {
  showConfirm({
    title: t('settings.confirmReset') || '重置设置',
    msg: t('settings.confirmReset') || '确定要重置所有设置为默认值吗？',
    impact: '⚠ 主题颜色、模型配置、显示选项等将恢复为默认值',
    danger: true,
    okText: '确认重置',
    onConfirm: () => {
      applySidebarTheme('light');
      localStorage.removeItem('siper_meta_config');
      const metaDefaults = {
        cfgMetaTokens: true, cfgMetaTokensBr: false,
        cfgMetaCached: true, cfgMetaCachedBr: false,
        cfgMetaTools: true, cfgMetaToolsBr: false,
        cfgMetaSkills: true, cfgMetaSkillsBr: false,
        cfgMetaTime: true, cfgMetaTimeBr: false,
        cfgMetaToolSteps: true,
      };
      Object.keys(metaDefaults).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = metaDefaults[id];
      });
      toast.success(t('settings.resetDone'), 1500);
    }
  });
}

function toggleLangDropdown() {
  const menu = document.getElementById('langDropdownMenu');
  if (menu) menu.classList.toggle('show');
}

function selectLang(lang) {
  currentLang = lang;
  localStorage.setItem('siper_lang', lang);
  document.documentElement.lang = lang;
  // Update trigger button flag
  const trigger = document.getElementById('langDropdownTrigger');
  const flags = { zh: '🇨🇳', tw: '🇹🇼', en: '🇬🇧' };
  if (trigger) trigger.textContent = flags[lang] || '🇨🇳';
  // Update active state in dropdown
  document.querySelectorAll('.lang-dropdown-item').forEach(item => {
    item.classList.toggle('active', item.dataset.lang === lang);
  });
  // Close dropdown
  const menu = document.getElementById('langDropdownMenu');
  if (menu) menu.classList.remove('show');
  // Reload i18n texts
  if (typeof applyLang === 'function') applyLang(lang);
  if (typeof refreshLogs === 'function') refreshLogs();
}

// ===== Markdown Renderer (zero-dependency) =====

// ===== Sidebar Resize & Collapse =====
(function() {
  const sidebar = document.querySelector('.sidebar');
  const handle = document.getElementById('sidebarResizeHandle');
  const main = document.getElementById('mainContent');
  if (!sidebar || !handle || !main) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener('mousedown', function(e) {
    isResizing = true;
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    const newW = Math.max(120, Math.min(400, startWidth + dx));
    document.documentElement.style.setProperty('--sidebar-width', newW + 'px');
    sidebar.style.width = newW + 'px';
    sidebar.style.minWidth = newW + 'px';
    // Update handle position
    const handle = document.getElementById('sidebarResizeHandle');
    if (handle) handle.style.left = (newW - 3) + 'px';
    // Update collapse button position
    const btn = document.getElementById('sidebarCollapseBtn');
    if (btn) btn.style.left = newW + 'px';
  });

  document.addEventListener('mouseup', function() {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  // Collapse toggle
  window.toggleSidebarCollapse = function() {
    const collapsed = sidebar.classList.toggle('collapsed');
    main.classList.toggle('expanded', collapsed);
    const btn = document.getElementById('sidebarCollapseBtn');
    const handle = document.getElementById('sidebarResizeHandle');
    if (collapsed) {
      // Collapse: narrow icon bar (48px)
      document.documentElement.style.setProperty('--sidebar-width', '48px');
      sidebar.style.width = '48px';
      sidebar.style.minWidth = '48px';
      if (btn) {
        btn.textContent = '▶';
        btn.style.left = '48px';
      }
      if (handle) handle.style.display = 'none';
    } else {
      // Expand: restore full width
      document.documentElement.style.setProperty('--sidebar-width', '160px');
      sidebar.style.width = '';
      sidebar.style.minWidth = '';
      if (btn) {
        btn.textContent = '◀';
        btn.style.left = '160px';
      }
      if (handle) {
        handle.style.display = '';
        handle.style.left = '157px';
      }
    }
    // Save state
    localStorage.setItem('sidebarCollapsed', collapsed);
  };

  // Initialize handle and button position
  const _sw = sidebar.offsetWidth;
  const _handle = document.getElementById('sidebarResizeHandle');
  if (_handle) _handle.style.left = (_sw - 3) + 'px';
  const _btn = document.getElementById('sidebarCollapseBtn');
  if (_btn) _btn.style.left = _sw + 'px';

  // Restore state
  if (localStorage.getItem('sidebarCollapsed') === 'true') {
    sidebar.classList.add('collapsed');
    main.classList.add('expanded');
    document.documentElement.style.setProperty('--sidebar-width', '48px');
    sidebar.style.width = '48px';
    sidebar.style.minWidth = '48px';
    if (_btn) {
      _btn.textContent = '▶';
      _btn.style.left = '48px';
    }
    if (_handle) _handle.style.display = 'none';
  }

  // Tooltip for collapsed sidebar icons
  const tooltip = document.createElement('div');
  tooltip.className = 'sidebar-tooltip';
  tooltip.style.cssText = 'position:fixed;z-index:9999;padding:4px 10px;background:var(--bg-card);color:var(--text);font-size:13px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.15);pointer-events:none;opacity:0;transition:opacity 0.15s;white-space:nowrap;';
  document.body.appendChild(tooltip);
  sidebar.querySelectorAll('.nav-item').forEach(function(item) {
    item.addEventListener('mouseenter', function(e) {
      if (!sidebar.classList.contains('collapsed')) return;
      const text = item.querySelector('span:last-child');
      if (text && text.textContent) {
        tooltip.textContent = text.textContent;
        tooltip.style.opacity = '1';
        const rect = item.getBoundingClientRect();
        tooltip.style.left = (rect.right + 8) + 'px';
        tooltip.style.top = (rect.top + rect.height / 2 - 10) + 'px';
      }
    });
    item.addEventListener('mouseleave', function() {
      tooltip.style.opacity = '0';
    });
  });
  // Tooltip for collapsed sidebar footer buttons
  sidebar.querySelectorAll('.sidebar-footer > *, .sidebar-footer .lang-dropdown-trigger, .sidebar-footer .theme-palette-trigger, .sidebar-footer .sidebar-settings-toggle').forEach(function(btn) {
    btn.addEventListener('mouseenter', function(e) {
      if (!sidebar.classList.contains('collapsed')) return;
      const title = btn.getAttribute('title');
      if (title) {
        tooltip.textContent = title;
        tooltip.style.opacity = '1';
        const rect = btn.getBoundingClientRect();
        tooltip.style.left = (rect.right + 8) + 'px';
        tooltip.style.top = (rect.top + rect.height / 2 - 10) + 'px';
      }
    });
    btn.addEventListener('mouseleave', function() {
      tooltip.style.opacity = '0';
    });
  });
})();

// ===== Chain of Thought / Tool Call Tree =====
window.renderCotTree = function(steps) {
  if (!steps || !steps.length) return '';
  const statusIcon = { running: '⏳', done: '✓', error: '✗', pending: '○' };
  const statusClass = { running: 'running', done: 'done', error: 'error', pending: 'pending' };
  let html = '<div class="cot-tree">';
  html += '<div class="cot-tree-title"><span class="cot-icon">🧠</span>思维链</div>';
  for (const step of steps) {
    const sc = statusClass[step.status] || 'pending';
    const si = statusIcon[step.status] || '○';
    const time = step.duration ? '<span class="cot-step-time">' + step.duration + 'ms</span>' : '';
    html += '<div class="cot-step">';
    html += '<div class="cot-step-dot ' + sc + '">' + si + '</div>';
    html += '<div class="cot-step-content">';
    html += '<div class="cot-step-name">' + (step.name || step.tool || '未知步骤') + time + '</div>';
    if (step.detail) html += '<div class="cot-step-detail">' + step.detail + '</div>';
    html += '</div></div>';
  }
  html += '</div>';
  return html;
};

// ===== Code Block Enhancement =====
window.enhanceCodeBlocks = function(container) {
  if (!container) return;
  const pres = container.querySelectorAll('pre code');
  pres.forEach(function(code) {
    const pre = code.parentElement;
    // Skip if already enhanced (pre has md-code-block class or parent is md-code-block)
    if (pre && pre.classList && (pre.classList.contains('md-code-block') || (pre.parentElement && pre.parentElement.classList.contains('md-code-block')))) return;

    const block = document.createElement('div');
    block.className = 'md-code-block';

    // Detect language
    const cls = code.className || '';
    const langMatch = cls.match(/language-(\w+)/);
    const lang = langMatch ? langMatch[1] : '';

    // Language badge
    if (lang) {
      const badge = document.createElement('span');
      badge.className = 'md-code-lang';
      badge.textContent = lang;
      block.appendChild(badge);
    }

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'md-code-copy';
    copyBtn.textContent = '📋';
    copyBtn.title = '复制代码';
    copyBtn.onclick = function() {
      navigator.clipboard.writeText(code.textContent).then(function() {
        copyBtn.textContent = '✓';
        setTimeout(function() { copyBtn.textContent = '📋'; }, 1500);
      });
    };
    block.appendChild(copyBtn);

    // Move pre into block
    pre.parentNode.insertBefore(block, pre);
    block.appendChild(pre);

    // Apply Prism highlight
    if (window.Prism && lang) {
      Prism.highlightElement(code);
    }
  });
};

// ===== Mermaid Rendering =====
window.renderMermaid = function(container) {
  if (!container || !window.mermaid) return;
  // Handle code.language-mermaid blocks (from enhanceCodeBlocks)
  const mermaidBlocks = container.querySelectorAll('code.language-mermaid');
  mermaidBlocks.forEach(function(code, idx) {
    const pre = code.parentElement;
    if (!pre || pre.classList.contains('mermaid-container')) return;
    const container_div = document.createElement('div');
    container_div.className = 'mermaid-container';
    const mermaidId = 'mermaid-' + Date.now() + '-' + idx;
    container_div.innerHTML = '<div class="mermaid" id="' + mermaidId + '">' + code.textContent + '</div>';
    pre.parentNode.replaceChild(container_div, pre);
    try {
      window.mermaid.render(mermaidId, code.textContent).then(function(result) {
        document.getElementById(mermaidId).innerHTML = result.svg;
      }).catch(function(err) {
        container_div.innerHTML = '<div class="mermaid-error">Mermaid 渲染错误: ' + err.message + '</div>';
      });
    } catch(e) {
      container_div.innerHTML = '<div class="mermaid-error">Mermaid 初始化失败</div>';
    }
  });
  // Handle .mermaid containers (from renderMarkdown direct mermaid blocks)
  const mermaidContainers = container.querySelectorAll('.mermaid-container .mermaid');
  mermaidContainers.forEach(function(el) {
    const parent = el.parentElement;
    if (parent && parent.getAttribute('data-mermaid-rendered')) return;
    const src = el.textContent;
    const mermaidId = el.id || 'mermaid-auto-' + Date.now() + '-' + Math.random().toString(36).substr(2,6);
    el.id = mermaidId;
    try {
      window.mermaid.render(mermaidId, src).then(function(result) {
        el.innerHTML = result.svg;
        if (parent) parent.setAttribute('data-mermaid-rendered', 'true');
      }).catch(function(err) {
        parent.innerHTML = '<div class="mermaid-error">Mermaid 渲染错误: ' + err.message + '</div>';
      });
    } catch(e) { /* silent */ }
  });
};

// ===== KaTeX Rendering =====
window.renderKatex = function(container) {
  if (!container || !window.renderMathInElement) return;
  try {
    renderMathInElement(container, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false},
        {left: '\\(', right: '\\)', display: false},
        {left: '\\[', right: '\\]', display: true}
      ],
      throwOnError: false
    });
  } catch(e) { /* silent */ }
};

// ===== Post-render Enhancement Hook =====
window.postRenderEnhance = function(container) {
  if (!container) return;
  enhanceCodeBlocks(container);
  renderMermaid(container);
  renderKatex(container);
};

// Close dropdown when clicking outside

/**
 * Render TTS audio bars on the last agent message bubble.
 * Used by both streaming (stream_end) and non-streaming (response) paths.
 * @param {Array} toolSteps - array of {tool_name, success, result}
 */
window.renderTtsAudioBars = function(toolSteps) {
  if (!toolSteps || toolSteps.length === 0) return;
  try {
    const chatEl = document.getElementById('chatMessages');
    if (!chatEl) return;
    const rows = chatEl.querySelectorAll('.msg-row.agent');
    if (!rows.length) return;
    const lastRow = rows[rows.length - 1];
    const bubble = lastRow.querySelector('.msg-body');
    if (!bubble) return;
    for (const step of toolSteps) {
      if (step.tool_name !== 'text_to_speech' || !step.success) continue;
      let audioUrl = '';
      try {
        const data = JSON.parse(step.result);
        audioUrl = data.audio_path || '';
      } catch(e) {
        try {
          const m = step.result.match(/['"]audio_path['"]\s*:\s*['"]([^'"]+)['"]/);
          if (m) audioUrl = m[1];
        } catch(e2) {}
      }
      if (audioUrl.startsWith('/home/gavin/.siper/uploads/')) {
        audioUrl = audioUrl.replace('/home/gavin/.siper/uploads/', '/uploads/');
      }
      if (!audioUrl) continue;
      const audioEl = document.createElement('div');
      audioEl.className = 'tts-audio-bar';
      audioEl.innerHTML = `
        <button class="tts-play-btn" onclick="toggleTtsAudio(this, '${audioUrl.replace(/'/g, "\\'")}')">
          <span class="tts-play-icon">▶</span>
        </button>
        <div class="tts-waveform">
          <div class="tts-wave-bar"></div><div class="tts-wave-bar"></div>
          <div class="tts-wave-bar"></div><div class="tts-wave-bar"></div>
          <div class="tts-wave-bar"></div><div class="tts-wave-bar"></div>
          <div class="tts-wave-bar"></div><div class="tts-wave-bar"></div>
        </div>
        <span class="tts-label">🔊 语音消息</span>
        <audio class="tts-audio" src="${audioUrl}" preload="none"></audio>
      `;
      bubble.appendChild(audioEl);
    }
  } catch(e) {}
};
document.addEventListener('click', function(e) {
  const dd = document.querySelector('.lang-dropdown');
  const menu = document.getElementById('langDropdownMenu');
  if (dd && menu && !dd.contains(e.target)) {
    menu.classList.remove('show');
  }
});

// ===== TTS Audio Player =====
window.toggleTtsAudio = function(btn, audioUrl) {
  const bar = btn.closest('.tts-audio-bar');
  const audio = bar.querySelector('.tts-audio');
  const icon = btn.querySelector('.tts-play-icon');
  const waveform = bar.querySelector('.tts-waveform');

  // Stop any other playing TTS
  document.querySelectorAll('.tts-audio-bar.playing').forEach(other => {
    if (other === bar) return;
    const otherAudio = other.querySelector('.tts-audio');
    const otherIcon = other.querySelector('.tts-play-icon');
    otherAudio.pause();
    otherAudio.currentTime = 0;
    otherIcon.textContent = '▶';
    other.classList.remove('playing');
  });

  if (bar.classList.contains('playing')) {
    audio.pause();
    audio.currentTime = 0;
    icon.textContent = '▶';
    bar.classList.remove('playing');
  } else {
    audio.play().then(() => {
      icon.textContent = '⏸';
      bar.classList.add('playing');
      waveform.classList.add('playing');
    }).catch(() => {
      icon.textContent = '▶';
    });
  }

  audio.onended = function() {
    icon.textContent = '▶';
    bar.classList.remove('playing');
    waveform.classList.remove('playing');
  };
}

// == Theme palette button event binding ==
document.getElementById('themePaletteTrigger').addEventListener('click', function(e) {
  e.stopPropagation();
  toggleThemePalette();
});
