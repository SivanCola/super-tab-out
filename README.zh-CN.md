# Super Tab Out

[English](./README.md) · 简体中文

**一个面向 Chromium 浏览器的本地新标签页控制台。**

Super Tab Out 会替换默认新标签页，把你打开的标签集中成一个清爽的可视化面板。它支持按域名分组，也支持按 Chrome 原生 Tab Groups 分组；同时提供固定标签保护、本地标签过滤、隐私模式、中英文界面和更丰富的主题选择。

不需要服务器。不需要账号。不做遥测。没有构建步骤。加载 `extension/` 文件夹即可使用。

版本记录见 [`CHANGELOG.zh-CN.md`](./CHANGELOG.zh-CN.md)。

---

## 核心优势

- **文字优先的控制台布局**：新标签页层级更清楚，右上角控件更集中，页头不再显示额外的品牌图标。
- **两种组织方式**：可在域名分组和 Chrome 原生 Tab Groups 视图之间切换。
- **快速过滤标签**：按 `/` 后可实时过滤卡片、标签、URL 和分组名。
- **搜索过滤语法**：支持 `domain:`、`group:`、`url:` 和 `saved:`，并高亮匹配内容。
- **侧边栏控制台**：不离开当前网页也能搜索、跳转、稍后再看、关闭、清理重复、恢复最近关闭标签和使用本地工具。
- **停靠式 Command Center**：桌面布局中可从紧凑 dock 一键打开工具，并支持收藏工具排序。
- **借鉴 FeHelper 的本地工具箱**：新增三栏完整工具工作台，覆盖 JSON、URL 解析、编解码、时间戳、真实二维码 SVG、UUID/密码、Hash、Cookie 和会话导出。
- **快捷键与地址栏入口**：在地址栏输入 `sto` 可搜索或执行动作，也可用 commands 打开侧边栏、保存会话和切换隐私模式。
- **无障碍与动效控制**：图标按钮补齐可访问标签，标签 chip 支持键盘触发，并尊重系统减少动态效果设置。
- **适合屏幕共享的隐私模式**：点击锁图标或按 `Esc`，把标签面板隐藏成简洁的时钟屏幕。
- **固定标签保护**：固定标签不会出现在卡片、统计、重复清理或批量关闭动作中。
- **一键清理重复页**：重复 URL 会被标记，可一键保留一份并关闭多余副本。
- **稍后再看**：关闭前可把标签保存到本地清单。
- **自动刷新**：打开、关闭、跳转标签以及分组变化都会自动刷新面板。
- **中英文界面**：右上角可在 English / 简体中文之间切换。
- **更多主题，更好切换**：内置 12 套主题，并提供更大的主题面板。
- **本地优先的隐私策略**：设置和保存的标签都留在你的机器上。

---

## 界面与控件

![Super Tab Out 仪表盘](./store-assets/screenshot-1-dashboard.jpg)

页头保留产品名、问候语和日期，但不再额外展示应用图标。这样新标签页更干净，浏览器工具栏和扩展管理页中仍会显示扩展图标。

右上角控件保持紧凑：

- **锁图标**：切换隐私模式。
- **EN / 中**：切换固定 UI 文案的语言。
- **主题选择器**：打开包含 12 套主题的调色板。

内置主题：

| 主题 | 风格 |
| --- | --- |
| 暖纸 | 柔和的编辑纸感 |
| 纯白 | 极简白色工作台 |
| 跟随浏览器 | 跟随 Chrome/Edge 的浅色或深色外观 |
| 午夜 | 安静的深色工作区 |
| 极地 | 清爽蓝白 |
| 森林 | 低饱和绿与大地色 |
| 石墨金 | 石墨深色 + 金色强调 |
| 海岸珊瑚 | 海岸青绿 + 珊瑚色 |
| 李子工作室 | 低饱和李子色 |
| 抹茶书桌 | 护眼绿色阅读模式 |
| 余烬石板 | 深石板 + 暖色能量 |
| 薰衣草薄荷 | 浅薰衣草 + 薄荷色 |

更多发布截图：

| Chrome 分组 | 隐私模式 |
| --- | --- |
| ![Chrome Tab Groups 视图](./store-assets/screenshot-2-groups.jpg) | ![隐私模式](./store-assets/screenshot-3-privacy.jpg) |

| 主题面板 | 中文界面 |
| --- | --- |
| ![主题选择器](./store-assets/screenshot-4-themes.jpg) | ![中文界面](./store-assets/screenshot-5-chinese.jpg) |

---

## 安装

1. 克隆仓库：

```bash
git clone https://github.com/SivanCola/super-tab-out.git
cd super-tab-out
```

2. 打开浏览器扩展管理页：

```text
chrome://extensions
edge://extensions
brave://extensions
```

3. 打开 **开发者模式**。
4. 点击 **加载已解压的扩展程序**。
5. 选择本仓库里的 `extension/` 文件夹。
6. 打开一个新标签页。

后续更新时，拉取最新代码后在扩展管理页点击 **重新加载**：

```bash
git pull
```

---

## 调试

日常手动测试时，优先使用 Chrome，并在 `chrome://extensions` 中加载本仓库的 `extension/` 文件夹。

自动化扩展测试建议使用 **Chrome for Testing**，不要依赖普通品牌版 Chrome。新版品牌版 Chrome 可能会阻止通过命令行加载已解压扩展，而 Chrome for Testing 仍保留这类自动化调试能力。

本工作区可以把本地浏览器二进制放在：

```text
tools/chrome-for-testing/
```

这个目录体积较大，只用于本地调试，已被 Git 忽略。它不会进入 Chrome Web Store / Edge Add-ons 的 zip 包。

启动当前本地扩展：

```bash
npm run dev:host
```

脚本默认会在每次启动时准备一组可重复的手动回归场景：置顶主页、重复 URL、原生 Chrome Tab Groups、折叠分组、混合未分组标签页、最近关闭标签页、稍后再看条目、已保存会话、活动统计、成就，以及本地工具的收藏和状态。再次运行 `npm run dev:host` 时会先清理上一轮 seed 出来的标签页，再重新创建，避免测试标签越堆越多。

需要干净浏览器时使用 `scripts/launch-chrome-testing.sh --no-seed-tabs`，需要重置测试资料并重新生成场景时使用 `--reset-profile`。

可选覆盖环境变量：`CHROME_BIN`、`PROFILE_DIR`、`REMOTE_DEBUGGING_PORT`、`SEED_TABS`、`SEED_DELAY_MS`、`SEED_CLEANUP`、`SEED_REQUIRED`。

## 校验

扩展仍然不需要构建步骤，但仓库现在提供轻量本地检查：

```bash
node tests/run-tests.mjs
node scripts/validate-extension.mjs
```

校验脚本会检查 `manifest.json`、扩展脚本语法、服务脚本加载顺序，以及商店 ZIP 中是否误包含本地调试文件。

---

## 快捷键

| 按键 | 动作 |
| --- | --- |
| `/` | 聚焦标签过滤框 |
| 标签过滤框聚焦时按 `Esc` | 清空并取消聚焦 |
| 其他位置按 `Esc` | 切换隐私模式 |
| `Ctrl/Cmd + Shift + G` | 切换 Groups / Domains 视图 |
| `Ctrl/Cmd + Shift + Y` | 打开 Side Panel |

地址栏关键字：输入 `sto` 后接查询或动作，例如 `panel`、`save-session`、`dedupe`、`privacy`。

---

## 功能说明

### 标签面板

Super Tab Out 通过 `chrome.tabs.query({})` 读取打开的标签，过滤浏览器内部页面，并渲染为更容易操作的卡片：

- 普通网页按域名组成卡片
- Gmail、X、YouTube、LinkedIn、GitHub 等首页归入 Homepages 卡片
- 可切换到 Chrome Tab Groups 视图
- 重复 URL 会显示重复标记
- localhost 会显示端口号，方便区分本地项目

### 搜索

搜索框使用同一个本地索引覆盖打开标签、Chrome 分组标题、稍后再看条目和已保存会话。支持的过滤语法：

| 过滤 | 示例 |
| --- | --- |
| `domain:` | `domain:github auth` |
| `group:` | `group:work api` |
| `url:` | `url:docs extensions` |
| `saved:` | `saved:true article` 或 `saved:false github` |

### Side Panel

侧边栏让你停留在当前网页时也能使用 Super Tab Out：

- 搜索打开的标签、稍后再看条目和已保存会话
- 从新标签页仪表盘打开停靠式 Command Center
- 跳转到标签、保存稍后再看或关闭标签
- 清理重复标签并保留一份
- 通过 `chrome.sessions` 恢复浏览器最近关闭的标签/窗口
- 保存当前浏览会话
- 查看 Tab Health、本周统计、常见域名和整理成就
- 使用带收藏、最近使用、当前标签 URL 快捷入口和完整工具页跳转的本地工具目录

### 本地工具

完整 Tools 工作台可从 Command Center 打开，也可通过地址栏命令，例如 `sto tool json` 打开。

首批工具全部本地运行：JSON 格式化/压缩/校验并提供树状预览和错误诊断、URL 解析参数表、Base64/Unicode/HTML Entity、时间戳和 FILETIME 卡片、真实二维码 SVG、UUID/随机密码、MD5/SHA Hash、Cookie 转 JSON，以及会话导出为 JSON、Markdown 或 URL 列表。

### Chrome Tab Groups

域名卡片可以创建原生 Chrome Tab Groups。分组卡片支持重命名、改色、折叠/展开、解除分组和保存为会话。保存的会话会出现在主界面的“已保存会话”卡片中，恢复时会在当前窗口重新打开标签页并重建 Chrome 标签分组。

### 关闭逻辑

关闭动作使用精确 URL 匹配，范围只覆盖当前卡片展示的标签，避免误关同域名下的无关页面。

所有批量关闭和重复清理动作都会跳过固定标签。

### 稍后再看

点击书签按钮会先把标签保存到 `chrome.storage.local`，再关闭标签。保存的条目只存在本地，并可勾选归档。

### 隐私模式

隐私模式会隐藏标签面板，显示简洁的时钟和日期界面，适合屏幕共享或录屏前使用。你可以自定义是否显示：

- 时钟
- 日期
- 自定义文字
- 外部 favicon 请求

### 主题与语言

主题选择保存在 `localStorage`，并在页面绘制前应用，避免刷新时闪回默认主题。

语言选择同样保存在本地并提前应用。语言切换只影响固定 UI 文案；标签标题、URL、Chrome 分组名称和用户输入的文字不会被翻译或改写。

---

## 隐私说明

Super Tab Out 采用本地优先设计。

本地保存的数据包括：

- 稍后再看的标签
- 隐私模式状态与设置
- 视图模式
- 语言选择
- 主题选择
- favicon 缓存

外部 favicon 请求可在隐私设置中关闭。关闭后，已缓存的 favicon 仍可显示，但新域名不会请求图标服务。

日常使用中唯一的外部请求（开启时）是：

- `icons.duckduckgo.com`，用于获取 favicon，并在本地缓存 7 天

扩展不使用 Google Fonts，字体来自系统字体栈。

隐私模式不提供网页搜索框，也不会更改浏览器搜索服务提供商。

商店上传包只生成在 `dist/` 目录：

- `dist/super-tab-out-chrome-1.0.2.zip`
- `dist/super-tab-out-edge-1.0.2.zip`

---

## 权限说明

扩展当前请求以下权限：

| 权限 | 用途 |
| --- | --- |
| `tabs` | 读取、聚焦、关闭和分组打开的标签 |
| `storage` | 保存稍后再看、会话、统计、隐私设置和视图模式 |
| `tabGroups` | 读取、展示、创建、更新、折叠和取消 Chrome Tab Groups |
| `sidePanel` | 显示侧边栏控制台 |
| `sessions` | 展示并恢复最近关闭的浏览器标签/窗口 |

---

## 技术栈

| 项目 | 实现 |
| --- | --- |
| 扩展平台 | Chrome Manifest V3 |
| UI | 原生 HTML、CSS、JavaScript |
| 存储 | `chrome.storage.local` 和 `localStorage` |
| 音效 | Web Audio API |
| 动画 | CSS transitions 和 JavaScript 粒子 |
| 构建 | 无 |

所有逻辑都运行在扩展页面内。后台 service worker 只负责同步工具栏角标中的标签数量。

---

## 致谢与许可

Super Tab Out 按 Apache License 2.0 分发。

本项目是基于 **Zara Zhang** 的 **[Tab Out](https://github.com/zarazhangrui/tab-out)** 的衍生作品；原项目使用 MIT License。

Apache-2.0 协议全文位于 [`LICENSE`](./LICENSE)。上游 MIT 的必要版权和许可声明保留在 [`NOTICE`](./NOTICE)。请不要从实质性复制或分发版本中移除这些声明。

本分叉在此基础上加入了安全加固、Manifest V3 更新、跨浏览器新标签识别、固定标签保护、Chrome Tab Groups 视图、中英文界面、扩展主题、隐私模式、标签过滤、favicon 缓存以及本地优先的稍后再看流程。

本项目不隶属于 Google、Chrome、Microsoft Edge、Brave、DuckDuckGo 或原 Tab Out 作者。相关产品名和服务名仅用于说明兼容性或必要署名。

Apache-2.0。详见 [`LICENSE`](./LICENSE) 和 [`NOTICE`](./NOTICE)。
