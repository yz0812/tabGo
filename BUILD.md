# 构建与发布

TabGo 使用 [WXT](https://wxt.dev) 构建，需要 Node.js 20+。

## 本地构建

```bash
npm install
npm run compile      # 类型检查
npm run zip          # .output/tabgo-<version>-chrome.zip
npm run zip:edge     # .output/tabgo-<version>-edge.zip
```

只需要未打包目录时使用 `npm run build` / `npm run build:edge`，产物在 `.output/chrome-mv3`、`.output/edge-mv3`，可在扩展管理页面“加载已解压的扩展程序”直接加载。

## 自动发布（GitHub Actions）

推送 `v*` tag 时，`.github/workflows/build-extension.yml` 会：

1. 安装依赖（`npm ci`）
2. 从 `package.json` 读取版本号
3. 类型检查（`npm run compile`）
4. 打包 Chrome 与 Edge 两个 zip
5. 上传构建产物并创建 GitHub Release

### 发布步骤

```bash
# 1. 更新 package.json 中的 version
git add package.json
git commit -m "Bump version to x.x.x"
git push

# 2. 打 tag（需与 package.json 版本一致）
git tag vx.x.x
git push origin vx.x.x
```

## 发布到商店

- **Chrome 网上应用店**：上传 `tabgo-x.x.x-chrome.zip`
- **Edge 外接程序**：上传 `tabgo-x.x.x-edge.zip`

## 常见问题

- **类型错误导致构建失败**：本地运行 `npm run compile` 查看
- **`.wxt/` 类型缺失**：运行 `npx wxt prepare`
- **Chrome 137+ 命令行 `--load-extension` 无效**：在扩展管理页面手动加载 `.output/chrome-mv3`
