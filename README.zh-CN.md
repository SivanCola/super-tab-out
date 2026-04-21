# Super Tab Out

[English](./README.md) · 简体中文

**一个面向 Chromium 浏览器的本地新标签页控制台。**

Super Tab Out 会替换默认新标签页，把你打开的标签集中成一个清爽的可视化面板。它支持按域名分组，也支持按 Chrome 原生 Tab Groups 分组；同时提供固定标签保护、本地标签过滤、隐私模式、中英文界面和更丰富的主题选择。

不需要服务器。不需要账号。不做遥测。没有构建步骤。加载 `extension/` 文件夹即可使用。

---

## 核心优势

- **两种组织方式**：可在域名分组和 Chrome 原生 Tab Groups 视图之间切换。
- **快速过滤标签**：按 `/` 后可实时过滤卡片、标签、URL 和分组名。
- **适合屏幕共享的隐私模式**：点击锁图标或按 `Esc`，把标签面板隐藏成简洁的时钟屏幕。
- **固定标签保护**：固定标签不会出现在卡片、统计、重复清理或批量关闭动作中。
- **一键清理重复页**：重复 URL 会被标记，可一键保留一份并关闭多余副本。
- **稍后再看**：关闭前可把标签保存到本地清单。
- **自动刷新**：打开、关闭、跳转标签以及分组变化都会自动刷新面板。
- **中英文界面**：右上角可在 English / 简体中文之间切换。
- **更多主题，更好切换**：内置 10 套主题，并提供更大的主题面板。
- **本地优先的隐私策略**：设置和保存的标签都留在你的机器上。

---

## 界面与控件

右上角控件保持紧凑：

- **锁图标**：切换隐私模式。
- **EN / 中**：切换固定 UI 文案的语言。
- **主题选择器**：打开包含 10 套主题的调色板。

内置主题：

| 主题 | 风格 |
| --- | --- |
| 暖纸 | 柔和的编辑纸感 |
| 午夜 | 安静的深色工作区 |
| 极地 | 清爽蓝白 |
| 森林 | 低饱和绿与大地色 |
| 石墨金 | 石墨深色 + 金色强调 |
| 海岸珊瑚 | 海岸青绿 + 珊瑚色 |
| 李子工作室 | 低饱和李子色 |
| 抹茶书桌 | 护眼绿色阅读模式 |
| 余烬石板 | 深石板 + 暖色能量 |
| 薰衣草薄荷 | 浅薰衣草 + 薄荷色 |

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

示例启动命令：

```bash
"tools/chrome-for-testing/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
  --user-data-dir=/tmp/super-tab-out-chrome-profile \
  --remote-debugging-port=9224 \
  --remote-allow-origins='*' \
  --load-extension="$(pwd)/extension" \
  --disable-extensions-except="$(pwd)/extension" \
  --no-first-run \
  --no-default-browser-check
```

---

## 快捷键

| 按键 | 动作 |
| --- | --- |
| `/` | 聚焦标签过滤框 |
| 标签过滤框聚焦时按 `Esc` | 清空并取消聚焦 |
| 其他位置按 `Esc` | 切换隐私模式 |
| `Ctrl/Cmd + Shift + G` | 切换 Groups / Domains 视图 |

---

## 功能说明

### 标签面板

Super Tab Out 通过 `chrome.tabs.query({})` 读取打开的标签，过滤浏览器内部页面，并渲染为更容易操作的卡片：

- 普通网页按域名组成卡片
- Gmail、X、YouTube、LinkedIn、GitHub 等首页归入 Homepages 卡片
- 可切换到 Chrome Tab Groups 视图
- 重复 URL 会显示重复标记
- localhost 会显示端口号，方便区分本地项目

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

日常使用中唯一的外部请求是：

- `icons.duckduckgo.com`，用于获取 favicon，并在本地缓存 7 天

扩展不使用 Google Fonts，字体来自系统字体栈。

隐私模式不提供网页搜索框，也不会更改浏览器搜索服务提供商。

---

## 权限说明

扩展当前请求以下权限：

| 权限 | 用途 |
| --- | --- |
| `tabs` | 读取、聚焦、关闭和分组打开的标签 |
| `storage` | 保存稍后再看、隐私设置和视图模式 |
| `tabGroups` | 读取并展示 Chrome Tab Groups |

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

Super Tab Out 是基于 **Zara Zhang** 的 **[Tab Out](https://github.com/zarazhangrui/tab-out)** 的衍生作品，并按 MIT License 分发。

本项目在 [`LICENSE`](./LICENSE) 中保留了必要的版权和许可声明。请不要从实质性复制或分发版本中移除这些声明。

本分叉在此基础上加入了安全加固、Manifest V3 更新、跨浏览器新标签识别、固定标签保护、Chrome Tab Groups 视图、中英文界面、扩展主题、隐私模式、标签过滤、favicon 缓存以及本地优先的稍后再看流程。

本项目不隶属于 Google、Chrome、Microsoft Edge、Brave、DuckDuckGo 或原 Tab Out 作者。相关产品名和服务名仅用于说明兼容性或必要署名。

MIT。详见 [`LICENSE`](./LICENSE)。
