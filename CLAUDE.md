# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

TabGo 是一个 Chrome/Edge 浏览器标签页自动分组扩展，基于 Manifest V3，使用 [WXT](https://wxt.dev) + Vue 3 + TypeScript + Tailwind CSS v4 开发。manifest 由 `wxt.config.ts` 生成，不要手写 `manifest.json`。

## 开发命令

```bash
npm install            # 安装依赖（postinstall 会执行 wxt prepare 生成 .wxt/ 类型）
npm run dev            # 开发模式，自动打开 Chrome 并热更新
npm run dev:edge       # Edge 开发模式
npm run compile        # vue-tsc 类型检查（提交前必须通过）
npm run build          # 构建到 .output/chrome-mv3
npm run build:edge     # 构建到 .output/edge-mv3
npm run zip            # 打包 .output/tabgo-<version>-chrome.zip
npm run zip:edge       # 打包 .output/tabgo-<version>-edge.zip
```

### 发布新版本
```bash
# 1. 更新 package.json 中的 version（manifest 版本取自这里）
git add package.json && git commit -m "Bump version to x.x.x" && git push
# 2. 创建 tag 触发 GitHub Actions：类型检查 + 打包 Chrome/Edge zip + 发布 Release
git tag vx.x.x && git push origin vx.x.x
```

## 架构

### 入口（src/entrypoints/）
- **background.ts**：Service Worker，分组调度、右键菜单、快捷键命令、消息处理，无 DOM 访问
- **content/**：页面内标签搜索浮层。**刻意使用原生 TS + closed Shadow DOM，不要引入 Vue**，以保证注入到每个网页的体积最小；CSS 通过 `?inline` 导入
- **popup/**：精简弹窗（Vue），当前网站状态、改分组名、白名单、窗口操作
- **options/**：全屏控制台（Vue），hash 路由：`/overview` `/rules` `/whitelist` `/extensions` `/settings` `/data`；`/rules?domain=xxx` 会预填域名

### 共享代码
- `src/utils/settings.ts`：存储键、默认值、`loadSettings` / `saveSettings` / `updateSetting`
- `src/utils/grouping.ts`：`resolveGroup(url, ctx)` 纯函数，决定标签所属分组（UI 与后台共用）
- `src/utils/domain.ts`：根域名（处理 com.cn、co.uk）、规则后缀匹配、名称简化（内置 TLD 列表）
- `src/utils/colors.ts`：分组颜色（单独拆出，避免 content script 打包 TLD 列表）
- `src/utils/messages.ts`：类型化消息协议 `MessageMap`
- `src/composables/`：`useSettings`（与 storage 双向同步的单例）、`useBrowserTabs`（实时标签/分组）

### 数据存储（键名与 2.x 兼容）

**chrome.storage.sync**：
- `whitelist`: 域名白名单数组（后缀匹配，`a.com` 匹配 `x.a.com`，不匹配 `aa.com`）
- `groupNames`: 自定义分组 `{ "分组名": ["domain1", "domain2"] }`，同一域名只属于一个分组
- `extensionWhitelist`: 不参与分组的扩展 ID，特殊值 `newtab` 表示新标签页

**chrome.storage.local**：`subdomainEnabled`、`groupTop`、`groupSortMode`（default/name/append）、`accordion`、`extensionReplace`、`clearGroupedTabs`、`enableNewtabGrouping`、`enableTabSearch`、`tabSearchKey`、`minGroupSize`

**chrome.storage.session**（Service Worker 休眠后仍保留）：`recentTabs`（标签搜索 MRU 顺序）、`managedGroupIds`（TabGo 创建的分组，只有这些会被自动拆分）

### 消息通信
- 页面 → 后台：`sendMessage(action, payload)`（`src/utils/messages.ts`），action：`quickGroup` `windowAction` `getTabs` `activateTab` `closeTab` `resolveUrl`
- 后台 → content script：`{ action: 'toggleTabSearch' }`

### 核心分组流程（background.ts）
1. 标签/设置事件 → `scheduleGroup(windowId)`：按窗口防抖 150ms，`runExclusive` 串行执行
2. `groupWindow()`：跳过固定标签，用 `resolveGroup()` 计算目标分组，应用 `minGroupSize`
3. 只对需要变化的标签调用 `tabs.group` / `tabs.ungroup`；不拆分用户手动创建的分组
4. `reorderWindow()`：仅在顺序不符合预期时移动分组

## 注意事项

- Service Worker 的监听器必须在 `defineBackground` 内同步注册；内存状态会随休眠丢失，需持久化的放 `storage.session`
- 拖动标签时浏览器会报 "cannot be edited"，分组逻辑已有重试，不要去掉
- 多窗口场景：分组操作需指定 `windowId`，避免跨窗口合并同名分组
- 快捷键（`commands`）没有默认按键，用户在 `chrome://extensions/shortcuts` / `edge://extensions/shortcuts` 中设置

### 文件读取策略

**强制规则**：每次调用 Read 工具时**必须**指定 `offset` 和 `limit` 参数，禁止使用默认值。

#### 参数要求

| 参数   | 要求           | 说明                          |
| ------ | -------------- | ----------------------------- |
| `offset` | **必须指定** | 起始行号（从 0 开始）         |
| `limit`  | **必须指定** | 读取行数，单次不超过 500 行   |

#### 读取流程

1. **侦察**：先用 Grep 了解文件结构，或定位目标关键词行号。
2. **精准打击**：使用 offset + limit 精确读取目标区域。
3. **扩展**：如果需要更多上下文，再调整 offset 继续读取。

**目标**：保持上下文精准、最小化。如果不遵守，工具调用将被 Hook 拦截。