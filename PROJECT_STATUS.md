# CommandDeck 项目现状（AI 交接）

> 最后核验：2026-07-24。`v0.1.2` 已完成 tag 构建并公开为 Pre-release；后续 AI 应先核对工作树、CI 和 GitHub Release 的实际状态。

## 一句话结论

CommandDeck `v0.1.2` 已于 2026-07-24 公开为 Pre-release。tag Actions 四平台构建和 release job 全部成功，Release 包含 7 个标准安装资产；当前不声称这些安装包已经完成跨平台实机安装验证。

## 仓库与发布状态

- 仓库：`https://github.com/PipeManGoGoGo/CommandDeck`，公开仓库，默认分支 `main`。
- 远端已有 `v0.1.0` Pre-release，包含 macOS ARM/Intel、Windows MSI/NSIS、Linux AppImage/DEB/RPM 等 9 个资产。
- 不可变的 `v0.1.1` tag 指向 `d19cdb0`。GitHub Actions run `30090343426` 中 macOS ARM、macOS Intel 和 Linux 构建成功；Windows 因缺少 `Win32_System_Threading` feature 构建失败，release job 随之跳过，仓库没有创建 `v0.1.1` Release。
- `v0.1.2` annotated tag 指向 `4b34ad91eb2b0dc2a5491ab74c9f8dc2096e04e2`。GitHub Actions run `30092094145` 全绿，包含 quality、macOS ARM、macOS Intel、Windows、Linux 构建和 release job。
- `v0.1.2` 于 `2026-07-24T12:22:37Z` 公开为 Pre-release：`https://github.com/PipeManGoGoGo/CommandDeck/releases/tag/v0.1.2`。
- Release 共 7 个安装资产：2 个 DMG，以及 MSI、NSIS EXE、AppImage、DEB、RPM 各 1 个；每个资产均带有 GitHub 提供的 SHA-256 digest。
- `v0.1.2` 内容包括自定义工具图标、PTY 纳管进程树清理、自然退出/关闭失败恢复、资源归属统计、Rust 测试补强和 Windows 原生 API feature 修复。
- quality job 使用 npm lock 与 Cargo `--locked`；tag 构建前会校验 `v` 标签和全部应用版本源一致。
- 四个 tauri-action 矩阵项只负责构建并上传标准安装 artifacts。仅 `v*` tag 会进入 build；单一 Ubuntu release job 校验 2 个 DMG、MSI、NSIS EXE、AppImage、DEB、RPM 后用 `RELEASE_NOTES.md` 创建 Draft、Pre-release。`workflow_dispatch` 不构建或创建 Release。
- 发布后 workflow 不再收集可选 `app.tar.gz`，避免两个 macOS 矩阵的同名 tar 在 `merge-multiple` 下载时互相覆盖；7 个标准安装资产的覆盖校验保持不变。

历史发布来源仍需保留记录：`v0.1.0` tag 指向 `066f2d3`，tag 触发的安装包构建失败；现有 9 个资产随后由 `4fc2036` 的手动 workflow 构建。`v0.1.1` 因 Windows feature 缺失而没有 Release；`v0.1.2` 已通过“tag 构建 → artifacts → 单一 Draft Release”流水线成功发布。

## `v0.1.2` 已发布能力

### 工作区与工具目录

- 首次选择工作目录，初始化默认分类；工具与分类支持 CRUD、搜索、跨分类移动和工作区切换保护。
- `tools.json`、`categories.json` 具备运行时解析校验，写入采用临时文件替换；`settings.json` 保存工作目录与主题。
- 工具支持多条命令、说明、笔记、安装/下载/验证预留字段，以及本地图片或 URL 自定义图标。

### 终端与进程归属

- Rust `portable-pty` 与前端 xterm.js 接通，支持输入、ANSI、缩放、持续交互和同一工具多实例。
- PTY reader 与 root watcher 共用 create → listen → start 闸门；快速自然退出会等到前端监听建立并调用 start 后才进入最终清理。
- Unix root watcher 使用 `waitid(..., WNOWAIT)` 观察根进程退出但暂不 reap，保留未 reap 的根进程/zombie 作为 SID 不可复用的所有权锚点；只有 session 清空后才调用 `wait`。若 session 尚未清空但锚点已经丢失，进程归属检查会 fail-closed，不会继续扫描可能已复用的 SID。
- Unix 通过独立 session、Windows 通过 Job Object 纳管进程范围；关闭、自然退出和应用退出会清理已纳管的完整进程树，并保留失败重试状态。
- 清理在等待 reader 前关闭可能维持 ConPTY 的 writer/master 句柄，最终状态和退出事件使用幂等保护。
- 自然退出、关闭和重启失败会收敛 Rust 与前端状态；有活动 PTY 时继续拦截应用关闭并请求确认。

### 资源、主题与交换格式

- macOS、Linux、Windows 均有整机与托管进程范围 CPU、内存、进程数和线程数统计代码；已发布实现按 PTY 实际归属范围聚合，减少无关同名进程干扰。
- 支持浅色/深色主题持久化。
- 支持导入 `.commanddeck.json`、旧 `.secbox.json` 和普通 JSON，导出 CommandDeck 1.0 JSON；导入只保存配置，不自动执行安装命令。

## 部分实现或未交付

| 能力 | 当前真实状态 |
| --- | --- |
| 安装与验证 | 字段已进入类型、表单、存储和导入导出，但没有执行安装或验证的后端命令。 |
| 导入流程 | 只导入配置，不自动安装；可选字段校验和整批回滚仍不完整。 |
| 导出格式 | 当前统一写出 `install_type: "custom"`，不能保留原始安装类型。 |
| 路径变量 | `{{TOOL_DIR}}` 与 `{{DOWNLOAD_URL}}` 直接展开，没有自动 shell quoting。 |
| 拖拽与排序 | 支持跨分类移动，不支持分类内工具排序，也没有拖拽锁。 |
| 版本兼容 | 顶层 `version` 尚未驱动 schema 兼容或迁移。 |
| 规划功能 | 工具自动安装、健康检查、代理注入、终端日志持久化和字体设置尚未交付。 |

## 验证记录

2026-07-24 已完成以下本地与远端发布验收：

| 检查 | 当前状态 |
| --- | --- |
| `npm run build` | 通过，TypeScript 与 Vite 生产构建成功。 |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` | 通过；`git diff --check` 同时通过。 |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml` | 通过，19/19 项 Rust 单元测试全部成功。 |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | 使用仓库外独立 `CARGO_TARGET_DIR` 通过。 |
| Linux 核心模块条件编译 | 通过，Unix process scope/root watcher 核心模块的 Linux 条件代码已完成编译检查。 |
| 完整 Tauri Linux 交叉检查 | 当前环境缺少目标平台 GTK/GLib 开发库，完整 Tauri 交叉检查未完成；不能据此声称 Linux 桌面包已经过本地交叉构建验证。 |
| workflow YAML/发布逻辑 | Ruby YAML 解析、actionlint v1.7.7、静态 job/产物断言通过；tag Actions run `30092094145` 全绿。 |
| 版本一致性 | 通过；六处应用版本源均为 `0.1.2`，并确认 `Win32_System_Threading` feature 保留。 |
| 远端发布 | `v0.1.2` annotated tag 指向 `4b34ad91eb2b0dc2a5491ab74c9f8dc2096e04e2`；于 `2026-07-24T12:22:37Z` 公开为 Pre-release，7 个资产均有 GitHub SHA-256 digest。 |

尚未覆盖：

- 前端单元/组件测试和端到端测试；仓库当前没有对应脚本。
- GUI 启动冒烟、本机完整 `tauri build`、安装/升级/卸载验证。
- `v0.1.2` 的 macOS ARM/Intel、Windows、Linux 安装包实机安装与运行验证；Actions 原生矩阵构建已经通过。
- 真实 Windows ConPTY 下的快速自然退出、重启失败与后代进程逃逸压力测试。

## 已知风险

### 发布与平台风险

1. `v0.1.2` 的 7 个公开安装资产仍未正式代码签名或 macOS 公证；GitHub 已提供每个资产的 SHA-256 digest，但没有独立签名或 provenance 资产，也尚未完成跨平台实机安装验证。
2. Windows 根进程由 `portable-pty` spawn 后才加入 Job Object，存在很小的 spawn → Job 绑定窗口；根进程若在绑定前立即创建后代，该后代理论上可能逃逸 Job。当前“完整进程树清理”仅对成功纳管范围成立。
3. macOS/Linux shell 与 Windows PowerShell 的 quoting、路径和进程清理行为存在天然差异；发布后仍需完成原生平台安装包实机回归。
4. 自动化测试虽已补充进程范围、Unix 所有权锚点、自然退出、清理幂等、启动闸门和句柄释放，但仍缺少真实 Windows ConPTY 生命周期、Tauri 事件顺序、前端和导入异常的端到端覆盖。

### 数据与安全边界

1. CommandDeck 会执行用户输入或导入配置中的任意命令。任何自动安装设计都必须有清晰预览、显式确认、可信来源提示和失败恢复。
2. `tools.json` 与 `categories.json` 各自原子写入，但没有跨文件事务、schema 版本或迁移框架；Windows 替换现有文件前仍有短暂空窗。
3. 导入模板值没有自动 shell quoting；不能假定含空格或 shell 元字符的路径天然安全。

### 维护项

1. npm 的 `xterm` 与旧 addon 包已停止维护，上游迁移到 `@xterm/xterm` 及对应 `@xterm/addon-*` 包。
2. 2026-07-23 的锁文件扫描曾命中若干 Rust 传递依赖告警；后续维护应重新扫描当前锁文件并评估可达性，不能仅凭版本命中断言应用可被利用或安全。
3. 仓库忽略的 `src-tauri/target` 本地缓存曾引用重命名前的路径；遇到 Tauri permission 缓存错误时应使用仓库外独立 `CARGO_TARGET_DIR` 复验。
4. 项目和 CI 约定使用 Node.js 24，但 `package.json` 尚未用 `engines` 或 `.nvmrc` 固定本地版本。

## 下一步

1. 在 macOS ARM/Intel、Windows 和 Linux 上验证已发布资产的安装、启动、PTY 输出/输入、自然退出、关闭、重启失败与后代进程清理，并记录结果。
2. 建立正式代码签名、macOS 公证、独立签名和 provenance 策略；继续使用 GitHub SHA-256 digest 核对下载资产。
3. 收紧 Windows spawn → Job 绑定竞态。
4. 补前端基础测试、导入数据边界测试和真实 ConPTY/Tauri 事件生命周期测试。
5. 迁移已停止维护的 xterm 旧包，并继续区分开发指南中的规划与实际交付。

## 本地协作环境备注

- 当前环境访问 GitHub 时可使用本机代理；代理地址不应写入应用、workflow 或发布资产。
- 不要清理其他协作者的工作树或构建缓存；未经明确授权不得提交、推送、打 tag 或创建 Release。
