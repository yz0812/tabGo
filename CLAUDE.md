# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

TabGo 是一个 Chrome/Edge 浏览器标签页自动分组扩展，基于 Manifest V3，使用原生 JavaScript 开发（无构建工具）。

## 开发命令

### 本地打包
```bash
# Windows
build.bat

# Linux/Mac
chmod +x build.sh && ./build.sh
```

### 发布新版本
```bash
# 1. 更新 manifest.json 中的版本号
# 2. 提交并推送
git add manifest.json && git commit -m "Bump version to x.x.x" && git push

# 3. 创建 tag 触发 GitHub Actions 自动构建
git tag vx.x.x && git push origin vx.x.x
```

### 开发模式安装
1. 打开 `chrome://extensions/` 或 `edge://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"，选择项目根目录

## 架构

### 运行环境
- **Background (Service Worker)**: `src/background/background.js` - 核心分组逻辑，无 DOM 访问
- **Content Script**: `src/content/content_script.js` - 注入页面，处理右键菜单交互
- **Popup**: `src/popup/` - 扩展弹出窗口，设置开关和导入导出
- **Pages**: `src/pages/` - 白名单、分组别名、扩展白名单管理页面

### 数据存储

**chrome.storage.sync** (跨设备同步):
- `whitelist`: 域名白名单数组
- `groupNames`: 自定义分组名称映射 `{ "分组名": ["domain1", "domain2"] }`
- `extensionWhitelist`: 扩展白名单数组（不参与分组的扩展 ID）

**chrome.storage.local** (本地设置):
- `subdomainEnabled`: 是否按完整子域名分组
- `groupTop`: 分组标签页是否置顶
- `accordion`: 手风琴模式（激活分组时折叠其他）
- `extensionReplace`: 是否用扩展名称替换扩展 ID
- `extensionReplaceMap`: 扩展 ID 到名称的映射
- `clearGroupedTabs`: 启动时是否关闭分组标签
- `enableNewtabGrouping`: 是否对新标签页进行分组

### 消息通信

Background ↔ Content Script 通信使用 `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`：
- `quickGroup`: 触发快速分组
- `promptForGroupName`: 弹出输入框设置分组名称

### 核心分组流程 (background.js)

1. `groupTabs(windowId)` - 入口，按窗口处理
2. `processAndGroupTabs()` - 遍历标签页，调用 `determineGroupInfo()` 决定分组
3. `determineGroupInfo()` - 检查白名单、特殊页面、扩展页面、自定义分组名
4. `updateTabGroups()` - 创建/更新标签组
5. `reorderTabsAndGroups()` - 可选的分组置顶排序

### 静态资源 (assets/)
- `data/domain.txt`: 常见顶级域名列表，用于简化分组名称
- `data/aliases.json`: Chrome/Edge 特殊页面别名映射
- `icons/`: 扩展图标
- `lib/tailwindcss.3.4.16.js`: Tailwind CSS（仅 UI 页面使用）
- `images/`: 其他图片资源

## 权限说明

```json
{
  "permissions": ["tabs", "storage", "tabGroups", "contextMenus", "management"],
  "host_permissions": ["*://*/*"]
}
```

- `tabs` + `tabGroups`: 标签页分组核心功能
- `storage`: 配置持久化
- `contextMenus`: 右键菜单
- `management`: 获取已安装扩展列表（用于扩展名称替换）

## 注意事项

- 这是一个纯静态扩展项目，无需 npm/yarn 安装依赖
- 修改后直接在浏览器扩展页面点击刷新按钮即可生效
- Service Worker 闲置 30 秒后会休眠，消息发送需处理 `chrome.runtime.lastError`
- 多窗口场景：分组操作需指定 `windowId`，避免跨窗口合并同名分组
