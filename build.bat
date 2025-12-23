@echo off
REM TabGo Extension Build Script for Windows
REM 用于本地打包测试

echo === TabGo Extension Build Script ===
echo.

REM 获取版本号
for /f "tokens=2 delims=:, " %%a in ('findstr /r "\"version\"" manifest.json') do (
    set VERSION=%%~a
)
echo Extension version: %VERSION%

REM 清理旧的构建
echo Cleaning old builds...
if exist build rmdir /s /q build
if exist tabgo-*.zip del /q tabgo-*.zip

REM 创建构建目录
echo Creating build directory...
mkdir build\tabgo

REM 复制文件
echo Copying files...
copy manifest.json build\tabgo\ >nul
xcopy /E /I /Q background build\tabgo\background >nul
xcopy /E /I /Q content build\tabgo\content >nul
xcopy /E /I /Q popup build\tabgo\popup >nul
xcopy /E /I /Q options build\tabgo\options >nul
xcopy /E /I /Q pages build\tabgo\pages >nul
xcopy /E /I /Q assets build\tabgo\assets >nul

REM 显示打包内容
echo.
echo === Build contents ===
dir /b build\tabgo

REM 创建 ZIP 包（需要安装 7-Zip 或 PowerShell）
echo.
echo Creating ZIP package...
powershell -command "Compress-Archive -Path build\tabgo\* -DestinationPath tabgo-%VERSION%.zip -Force"

REM 显示结果
echo.
echo === Build complete ===
dir tabgo-*.zip
echo.
echo Package created: tabgo-%VERSION%.zip
echo You can now load this extension in Chrome by:
echo 1. Extract the ZIP file
echo 2. Go to chrome://extensions/
echo 3. Enable Developer mode
echo 4. Click 'Load unpacked' and select the extracted folder
echo.
pause
