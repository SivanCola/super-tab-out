## 产品与设计原则

在设计产品功能或页面时，尽可能从产品经理和 UI 交互设计师的角度出发：

- 先明确用户场景、核心任务、使用频率和决策成本，再决定功能优先级。
- 页面布局要服务于用户的扫描、比较、搜索、跳转和批量操作，不要只追求装饰性。
- 交互设计要关注状态反馈、空状态、加载状态、错误状态、快捷键、可访问性和误操作防护。
- 可以参考优秀项目和成熟产品的经验，但要结合 Super Tab Out 的定位、权限边界、隐私承诺和本地优先特性进行取舍。
- 新增功能应尽量保持轻量、直观、可解释，避免让新标签页变成需要学习成本的复杂工作台。

## Edge / Chrome 商店多语言发布

- 扩展内部 UI 支持中英文，不等于商店会识别为两种语言；商店语言数量主要取决于扩展包内的 i18n 元数据。
- `extension/manifest.json` 中面向商店和浏览器显示的字段应使用 `__MSG_...__` 占位符，并保留 `default_locale`。不要把 `name`、`description`、命令说明等重新改回硬编码字符串。
- 维护语言时同步更新 `extension/_locales/en/messages.json` 和 `extension/_locales/zh_CN/messages.json`。Chrome/Edge 扩展 locale 目录使用下划线格式，例如 `zh_CN`，不是 `zh-CN`。
- 打包脚本必须把 `_locales/en/messages.json` 和 `_locales/zh_CN/messages.json` 放进 ZIP；校验脚本也要检查这些文件，避免 Edge Partner Center 只显示 1 种语言。
- 上传新版 Edge 包后，还需要在 Partner Center 的 Store listings 中补齐对应语言的商店描述等字段；线上商店页的语言数量通常要等新版本审核发布后才会变化。
