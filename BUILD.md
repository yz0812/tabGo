# TabGo 自动打包说明

## GitHub Actions 自动打包

本项目已配置 GitHub Actions 自动打包功能，可以自动构建浏览器扩展包。

### 触发方式

#### 方式 1：创建 Git Tag（推荐）

```bash
# 创建并推送 tag
git tag v1.5.0
git push origin v1.5.0
```

#### 方式 2：手动触发

1. 访问 GitHub 仓库的 Actions 页面
2. 选择 "Build Extension" workflow
3. 点击 "Run workflow" 按钮
4. 选择分支并运行

### 自动化流程

1. **触发构建**：当推送 tag 或手动触发时启动
2. **读取版本**：从 `manifest.json` 中自动读取版本号
3. **打包文件**：只包含运行所需的文件
   - manifest.json
   - background/
   - content/
   - popup/
   - options/
   - pages/
   - assets/
4. **生成 ZIP**：创建 `tabgo-{version}.zip` 文件
5. **上传 Artifact**：保存 30 天供下载
6. **创建 Release**：如果是 tag 触发，自动创建 GitHub Release

### 下载打包文件

#### 从 Artifacts 下载（所有构建）

1. 访问 Actions 页面
2. 选择对应的 workflow 运行记录
3. 在 Artifacts 区域下载 `tabgo-extension`

#### 从 Releases 下载（仅 tag 触发）

1. 访问仓库的 Releases 页面
2. 选择对应版本
3. 下载 `tabgo-{version}.zip`

## 本地打包

如果需要在本地测试打包，可以使用提供的脚本：

### Windows

```bash
build.bat
```

### Linux/Mac

```bash
chmod +x build.sh
./build.sh
```

## 安装扩展

### 从 ZIP 包安装

1. 下载并解压 `tabgo-{version}.zip`
2. 打开 Chrome 浏览器
3. 访问 `chrome://extensions/`
4. 开启右上角的"开发者模式"
5. 点击"加载已解压的扩展程序"
6. 选择解压后的 `tabgo` 目录

### 直接加载（开发模式）

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目根目录

## 发布新版本

1. 更新 `manifest.json` 中的版本号
2. 提交代码到 Git
3. 创建并推送 tag：
   ```bash
   git add manifest.json
   git commit -m "Bump version to 1.6.0"
   git push
   git tag v1.6.0
   git push origin v1.6.0
   ```
4. GitHub Actions 会自动构建并创建 Release

## 注意事项

- ✅ 打包文件只包含运行所需的文件，不包含开发工具配置
- ✅ 版本号自动从 `manifest.json` 读取
- ✅ 构建产物（build/, *.zip）已在 .gitignore 中忽略
- ⚠️ 确保 `manifest.json` 中的版本号与 tag 版本一致
- ⚠️ Tag 格式必须为 `v*`（如 v1.5.0）

## 故障排查

### 构建失败

1. 检查 Actions 日志查看错误信息
2. 确认所有必需的文件和目录都存在
3. 验证 `manifest.json` 格式正确

### 无法创建 Release

1. 确认推送的是 tag 而不是普通 commit
2. 检查 tag 格式是否为 `v*`
3. 确认仓库有 Release 权限

### 本地打包失败

**Windows:**
- 确保 PowerShell 可用
- 或安装 7-Zip 并修改脚本使用 7z 命令

**Linux/Mac:**
- 确保安装了 `zip` 命令：`sudo apt install zip`
- 给脚本添加执行权限：`chmod +x build.sh`
