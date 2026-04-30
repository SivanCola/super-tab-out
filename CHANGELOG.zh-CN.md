# 版本记录

[English](./CHANGELOG.md) · 简体中文

本文件记录 Super Tab Out 的主要版本变化。

## 未发布

## 1.0.2 - 2026-04-30

### 新增

- 新增 schema 感知的 storage、tabs、search、actions 和 metrics 服务，作为 v1.1 基础架构拆分的第一步。
- 新增 `chrome.storage.local` 存储迁移、quota/错误 toast 提示和轻量 Node 单元测试。
- 新增扩展校验脚本，覆盖 manifest、脚本语法、服务加载顺序和商店 ZIP 内容清洁度。
- 新增统一搜索索引，覆盖打开标签、Chrome 分组标题、稍后再看条目和已保存会话。
- 新增模糊搜索、匹配高亮，以及 `domain:` / `group:` / `url:` / `saved:` 过滤语法。
- 新增 manifest commands、`sto` 地址栏动作和可选 Side Panel 控制台。
- 新增 Side Panel 搜索、跳转、稍后再看、关闭、重复清理、最近关闭恢复和保存会话流程。
- 新增 Chrome Tab Groups 操作：从域名卡片创建原生分组、重命名、改色、折叠/展开、解除分组、保存会话，并可从主界面恢复为 Chrome 标签分组。
- 新增 Tab Health、本周统计、常见域名、整理成就，以及 Side Panel 里的 JSON、二维码风格编码和时间戳工具。
- 新增借鉴 FeHelper 的本地工具注册表、精简 Command Center 工具目录、三栏 Tools 工作台、工具收藏/最近使用、当前标签快捷处理、结构化预览、真实本地二维码 SVG 和会话导出。
- 新增图标按钮 `aria-label`、标签 chip 键盘触发、可见焦点状态、`prefers-reduced-motion` 支持和外部 favicon 隐私开关。

### 变更

- 将稍后再看、视图模式、隐私设置、标签关闭、重复清理和打开标签搜索接入共享服务。
- 扩展新标签页搜索框，现在会同时过滤标签卡片和稍后再看/归档条目。
- 更新 `sidePanel` 和 `sessions` 权限相关的隐私与说明文档。
- 更新外部 favicon 开关相关的隐私说明。
- 更新 README 截图库和商店截图，覆盖当前 Command Center 与 Tools 界面。
- 将扩展、package 元数据、校验脚本目标包名以及 Chrome/Edge 商店包同步提升到 `1.0.2`。

## 1.0.1 - 2026-04-22

### 变更

- 将扩展 manifest 版本号提升到 `1.0.1`，用于下一次商店上传。
- 将生成的 Chrome 和 Edge 商店包重命名为 `super-tab-out-chrome-1.0.1.zip` 和 `super-tab-out-edge-1.0.1.zip`。
- 同步更新英文和简体中文文档中的发布包文件名。
- 修复主题选择器层级，让完整主题面板可以显示在标签面板上方。

## 1.0.0 - 2026-04-21

### 新增

- 新增 Huashu 风格的新标签页视觉整理，整体更像安静的标签控制台，信息层级更清楚，卡片表面也更精致。
- 新增文字优先的页头品牌呈现：保留产品名、问候语和日期，不再在页面内额外显示装饰性的应用图标。
- 新增更清晰的右上角控件区，用于隐私模式、语言切换和主题选择。
- 新增商店发布包记录，Chrome 和 Edge 上传包统一生成到 `dist/`。

### 变更

- 优化标签卡片、分区标题、过滤控件、徽标、操作按钮和移动端布局。
- 浏览器 UI 和 manifest 中继续保留扩展图标，但移除了新标签页页头里的图标。
- 隐私页继续不提供网页搜索框，避免改变用户搜索体验。

### 验证

- 校验了 `manifest.json` 的 JSON 格式。
- 使用 Node 检查了 `app.js`、`background.js` 和 `theme-init.js` 的语法。
- 执行了 `git diff --check`。
- 使用 Chrome for Testing 加载真实已解压扩展，验证新页头、视口适配和图标移除结果。
- 检查了生成的 zip 内容，确认没有包含本地调试目录或 macOS 元数据。
