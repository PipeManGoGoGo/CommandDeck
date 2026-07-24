# CommandDeck AI 协作指南

## 适用范围与阅读顺序

本文件适用于整个仓库。任何 AI 或自动化代理开始工作前，按以下顺序建立上下文：

1. 阅读本文件。
2. 阅读 `PROJECT_STATUS.md`，确认当前版本、实现边界、验证结果和已知风险。
3. 阅读 `README.md`，了解面向用户的现行行为。
4. 仅在需要设计背景时阅读 `CommandDeck_DEV_GUIDE.md`。
5. 修改前检查相关源码、测试和 `git status`；不能只根据文档推断代码行为。

事实优先级为：可执行代码与测试结果 > `README.md` > `CommandDeck_DEV_GUIDE.md`。开发指南同时包含早期设计目标和实现步骤，部分内容尚未实现或已经过时。

## 项目定位与阶段

CommandDeck 是一个本地、跨平台的桌面 CLI 工作台，用于管理命令行工具、预设命令和 Markdown 笔记，并在应用内 PTY 终端中运行和持续交互。

项目的核心 MVP 主链路已经成型，并发布 `v0.1.0` 公开预览版；当前处于首版后的稳定化与功能打磨阶段。不要把预埋字段或开发指南中的规划项描述为已交付功能，具体边界见 `PROJECT_STATUS.md`。

## 架构边界

- `src/`：React 18 + TypeScript 前端。
- `src/store/index.ts`：Zustand 全局状态、工作区 JSON 解析校验、工具与分类变更串行化、终端视图状态。
- `src/utils/tauri.ts`：前端调用 Tauri command 的统一封装；组件不要新增散落的直接 `invoke`。
- `src/components/`：目录、工具详情、终端、笔记、导入导出、设置和资源监控 UI。
- `src-tauri/src/commands/storage.rs`：工作区与应用设置文件读写。
- `src-tauri/src/commands/pty.rs`：PTY 创建、启动、输入、缩放和清理。
- `src-tauri/src/commands/resource.rs`：macOS、Linux、Windows 的系统与托管进程资源采样。
- `src-tauri/src/state.rs`：Rust 侧 PTY 与存储锁状态。

数据位置：

- 用户选择的工作目录：`tools.json`、`categories.json`。
- Tauri 应用数据目录：`settings.json`。
- 工具与分类数据继续使用可读 JSON；写入使用临时文件加替换，必须保留异常恢复能力和旧 SecBox 数据兼容。

## 不可破坏的核心流程

### PTY 生命周期

PTY 启动必须保持以下顺序：

1. Rust `create_pty` 创建子进程和动态事件名，但通过 start gate 暂停读取。
2. 前端创建 xterm，并注册 `pty_output_<id>` 与 `pty_exit_<id>` 监听。
3. 前端调用 `start_pty` 解锁 Rust 读取线程。
4. 关闭、重启、自然退出和应用退出时同步清理 Rust 状态与前端状态。

不要合并或重排这个握手，否则可能丢失进程启动阶段的输出。修改 kill/close 行为时必须验证后代进程是否残留，不能只确认根 child 已退出。

### 数据与导入安全

- CommandDeck 会执行用户配置的任意命令，命令内容属于可信边界外输入。
- 当前导入只保存配置，不自动执行 `install_command` 或 `verify_command`。除非任务明确包含安全设计和用户确认，不得悄悄引入自动执行。
- 保持并加强导入 JSON 的运行时校验、未知/无效字段处理和同名工具策略。当前可选字段校验仍不完整，逐项写入失败时没有整批回滚。
- `{{TOOL_DIR}}` 与 `{{DOWNLOAD_URL}}` 当前直接替换进命令，没有自动 shell quoting；不要假定含空格或 shell 元字符的值天然安全。
- 安装、验证和用户预设命令只有在任务明确授权、执行内容已展示且用户确认后才能运行。只读审查不得执行导入包或工作区中的命令。
- 修改 `tools.json` 与 `categories.json` 时考虑两份文件之间的一致性；当前没有跨文件事务和 schema 迁移框架。
- 不在前端硬编码用户路径。跨平台命令需同时考虑 macOS/Linux shell 与 Windows PowerShell。

## 团队与并行协作

在 Maestri 环境中：

- 所有新启用的员工必须使用 `Codex` preset；不要启用 Claude Code、Antigravity、OpenCode 或其他模型代理。
- 产品经理维护全局上下文、范围、优先级和最终整合。
- 技术负责人负责架构、接口、数据模型和技术风险。
- 全栈实现工程师负责按已确认方案修改代码和补测试。
- 质量与安全工程师默认只读，负责独立验证、回归、安全与发布风险。
- 只有用户或产品经理明确授权并行、任务能够独立完成且文件范围不重叠时，才用 `maestri ask --batch` 并行执行调查、前后端实现、测试或文档工作。
- 不允许多名员工同时编辑同一文件或重叠代码范围；先按文件/模块划分所有权，再并行工作。
- 实现完成后必须由未参与该实现的质量与安全工程师复核；产品经理整合结论并推动问题闭环。

创建员工前先运行 `maestri list` 和 `maestri preset list`。已有合适角色时优先复用；确需创建时显式使用 `--preset "Codex"`。

## 修改原则

- 保持 React、Zustand、Tauri command 和 Rust 模块之间的既有边界。
- 保持修改小而可验证，不加入未进入实际流程的占位 UI 或死代码。
- 保留用户已有改动；不要覆盖无关文件或擅自清理工作区。
- 未经用户明确授权，不提交、不推送、不发布、不创建 Release，也不执行破坏性操作。
- 不编辑 `node_modules`、`dist` 或 `src-tauri/target` 中的生成内容。
- 功能、版本、CI 或 Release 状态变化后同步更新 `PROJECT_STATUS.md`；不要让状态文档继续引用旧提交。

## 验证基线

常规代码改动使用 Node.js 24，并至少运行：

```bash
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

只读审查不要在仓库内生成或改写构建产物；确需构建取证时，先获得授权并使用临时副本或仓库外的唯一构建目录。

本地曾观察到 `src-tauri/target` 中的 Tauri 构建缓存引用重命名前的 `/Users/info/Desktop/SecBox-v0.1`。若出现指向旧目录的 permission 文件缺失错误，先用唯一的独立目标目录区分缓存问题与源码问题：

```bash
commanddeck_target="$(mktemp -d -t commanddeck-cargo.XXXXXX)"
CARGO_TARGET_DIR="$commanddeck_target" cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
CARGO_TARGET_DIR="$commanddeck_target" cargo test --locked --manifest-path src-tauri/Cargo.toml
```

按变更风险追加验证：

- 终端相关：启动输出、输入、Ctrl+C、缩放、重启、关闭、自然退出、应用退出和后代进程清理。
- 存储相关：无文件首次启动、损坏 JSON、原子替换、并发变更、工作区切换和旧 SecBox 迁移。
- 跨平台相关：至少明确 macOS/Linux shell 与 Windows PowerShell 的差异；发布前依赖 CI 原生矩阵。
- UI 相关：键盘操作、对话框失败路径、浅/深主题、窄窗口和长文本。

完成标准：请求行为已实现，相关验证通过，工作区没有非预期改动，文档与实际行为一致，已知风险已向用户说明。
