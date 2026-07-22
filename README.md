# SecBox

SecBox 是一个面向安全测试工作的本地工具工作台。它将工具、启动命令和 Markdown 笔记集中管理，并通过应用内 PTY 终端运行命令。

## 安装使用

从 Release 下载当前系统对应的安装包：

- macOS Apple Silicon：`aarch64` DMG
- macOS Intel：`x86_64` DMG
- Windows 10/11：NSIS `setup.exe` 或 MSI

安装后首次打开，选择一个工作目录即可开始使用。macOS 使用当前用户的默认 Shell（通常是 zsh），Windows 使用系统自带的 PowerShell，因此 Windows 不需要额外安装 bash。

界面提供浅色与深色两种主题，可在底部操作栏一键切换，也可在设置页选择；主题会在重启后保留。

底部资源栏每 3 秒刷新一次，显示整机 CPU、内存，以及由 SecBox 启动的终端进程树所占用的 CPU、内存、进程数和线程数。占用低于 60% 显示绿色，60%–80% 显示黄色，达到 80% 显示红色警示。

> SecBox 会执行用户配置或导入的命令。只导入和运行你信任的工具包；导入操作本身不会自动执行安装命令。

## 本地开发

需要 Node.js 24、Rust stable，以及对应平台的 Tauri 2 系统依赖。

```bash
npm ci
npm run tauri dev
```

前端生产构建与桌面安装包：

```bash
npm run build
npm run tauri build
```

## 跨平台约定

- macOS 命令按用户默认 Shell 语法编写。
- Windows 命令按 PowerShell 语法编写；Windows PowerShell 5.1 中请用 `;`，不要依赖 PowerShell 7 才支持的语法。
- 导入包中的 `{{TOOL_DIR}}` 会替换成当前工作区下的 `tools/<工具名>`，并使用当前系统的路径分隔符。
- JSON 数据采用临时文件后替换的方式保存，减少异常退出导致文件截断的风险。

## 构建发布

`.github/workflows/build.yml` 会在原生 macOS 与 Windows runner 上生成安装包，同时保留 Linux 构建。推送 `v*` 标签或手动触发 workflow 即可构建。

## 数据位置

- 工作目录：`tools.json`、`categories.json`
- Tauri 应用数据目录：`settings.json`

工具和分类数据都是可读的 JSON，迁移工作区时可直接备份这两个文件。
