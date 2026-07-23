# CommandDeck 开发指南

## 项目简介

跨平台桌面命令行工具管理器，集中管理 CLI 工具、常用命令和笔记，支持一键在应用内交互式终端标签页启动执行。

---

## 核心定位

面向所有依赖命令行工作的用户。开发、运维、数据处理、AI CLI、自动化脚本和安全测试工具通常散落在不同目录，使用时需要反复切换路径、记忆参数或查找 shell history。CommandDeck 把它们按场景分类，每个工具可挂多条预设命令（如 `cd ~/projects/api && npm run dev`），点击即打开 PTY 终端执行；命令结束后仍可在同一终端继续交互。

---

## 功能需求

### 必须实现（MVP）
- 左侧窄栏：分类导航（纯锚点，显示工具数量如 `信息收集 (5)`），顶部搜索框
- 右侧主区域：工具卡片网格展示（图标 + 名称 + 简述 + 运行状态角标），按分类分组，分类标题显示工具数量（如 `信息收集 · 5个工具`）
- 工具的增删改，每个工具可导入自定义图标，可挂多条预设启动命令（默认一条，可按需追加）
- 点击卡片进入工具详情页（笔记 + 命令列表），点击运行命令新建终端 Tab
- 终端支持完整 pty（输入、Ctrl+C、ANSI 颜色、滚动）
- 同一命令可多实例运行，Tab 栏按工具分组合并显示（如 `sqlmap (3) ▾`），下拉切换/关闭实例
- 分类管理（增删改排序）
- **笔记（核心功能）**：每个工具一个 Markdown 笔记区，用于记录使用技巧、常用参数、示例命令。支持渲染态查看 + 编辑态修改，渲染态中的命令片段可快速复制。笔记是使用工具时的主要参考入口，优先级高于命令列表。
- **笔记快速查看面板**：终端运行时可通过 Tab 栏上的 📝 按钮或快捷键 `Cmd+E` 滑出笔记面板，终端不关闭，笔记只读，可拖拽调宽，方便边跑工具边查参数。
- 退出时若有运行中进程弹确认框
- 底部资源监控：整机 CPU/内存，以及 CommandDeck 管理的终端进程树 CPU、内存、进程数和线程数；每 3 秒刷新，60% 黄色、80% 红色警示
- 数据存本地 JSON，首次启动预设默认分类：开发工具、运维管理、数据处理、AI 与自动化、安全测试、其他工具

### 不做（后期）
代理注入、日志持久化、健康检查

### 交互优化
- **筛选运行中工具**：搜索框旁加筛选按钮，一键只显示有运行实例的工具
- **右键菜单**：工具卡片右键弹出菜单（编辑 / 删除 / 移动分类 / 启动）
- **空分类提示**：分类下无工具时显示「暂无工具，点击添加」引导
- **卡片快捷操作**：卡片上直接显示 ▶ 启动按钮（用第一条命令），无需进详情页就能快速启动
- **拖拽锁**：侧边栏和工具目录右上角锁定按钮，锁定后禁用拖拽防误操作
- **scrollspy**：右侧滚动时左侧分类导航自动高亮当前可见分类

---

## 工具导入导出

### 路径变量

| 变量 | 含义 |
|---|---|
| `{{TOOL_DIR}}` | 该工具的安装目录（如 `~/CommandDeck/tools/my-cli`） |
| `{{DOWNLOAD_URL}}` | 导入包里的下载地址 |

用户配置统一工具根目录（如 `~/CommandDeck/tools/`），每个工具自动创建子目录。变量在导入时自动替换为实际路径。

### 导出格式（.commanddeck.json）

导入器继续接受旧版 `.secbox.json` 和普通 `.json` 工具包；两者使用相同的数据结构。

```typescript
interface ToolExport {
  version: "1.0";
  exported_at: string;
  tools: ExportedTool[];
}

interface ExportedTool {
  name: string;
  category: string;           // 分类名，导入时自动匹配或新建
  description?: string;
  icon?: string;              // HTTPS URL 或本地图片转换后的 data URL
  download_url: string;       // GitHub release / 源码 URL
  install_type: "git" | "binary" | "python" | "custom"; // 安装模板类型
  install_command: string;    // 模板生成或手动填写，用 {{TOOL_DIR}} {{DOWNLOAD_URL}}
  verify_command?: string;    // 验证命令，如 "sqlmap --version"
  commands: { label: string; command: string }[];
  note?: string;
}
```

### 安装模板

提供四种预设模板，用户选类型 + 填 URL，自动生成安装命令：

| 模板 | 生成的命令 |
|---|---|
| **Git Clone** | `cd {{TOOL_DIR}} && git clone {{DOWNLOAD_URL}} . && pip install -r requirements.txt` |
| **Binary（压缩包）** | `cd {{TOOL_DIR}} && curl -L {{DOWNLOAD_URL}} -o _tmp && tar xzf _tmp --strip-components=1 && rm _tmp` |
| **Python** | `cd {{TOOL_DIR}} && git clone {{DOWNLOAD_URL}} . && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt` |
| **自定义** | 用户手写，支持 `{{TOOL_DIR}}` `{{DOWNLOAD_URL}}` 变量 |

模板生成后可手动修改。

### 导入流程

- 拖入或选择 `.commanddeck.json`、旧版 `.secbox.json` 或普通 `.json` 文件
- 预览：显示包含的工具列表，已存在的标记跳过
- 每个工具可展开修改：下载地址、安装类型、验证命令
- 配置下载代理（如 `socks5://127.0.0.1:1080`）和工具目录
- 点击「导入并安装」→ 逐个执行安装命令，显示进度
- 启动命令中的 `{{TOOL_DIR}}` 自动替换为实际路径

### 导出流程

- 工具列表右上角「导出」按钮
- 勾选要导出的工具
- 生成 `.commanddeck.json` 文件

---

## 工具健康检查

### 状态定义

| 状态 | 图标 | 含义 | 检测方式 |
|---|---|---|---|
| 就绪 | ✅ | 目录在 + 验证通过 | 目录存在 + verify_command 返回 0 |
| 未验证 | ⚠️ | 目录在但没验证过 | 目录存在 + 无 verify_command |
| 缺失 | ❌ | 目录不存在 | 路径不存在 |
| 未安装 | 📥 | 有下载链接但从未安装 | 路径不存在 + 有 install_command |

### 检测逻辑

```
工具目录存在？
├─ 否 → 有 install_command？
│       ├─ 是 → 📥 未安装（显示「安装」按钮）
│       └─ 否 → ❌ 缺失
└─ 是 → 有 verify_command？
        ├─ 是 → 执行验证命令
        │       ├─ 返回 0 → ✅ 就绪
        │       └─ 非 0 → ❌ 异常
        └─ 否 → ⚠️ 未验证
```

### 验证命令

`verify_command` 可选字段，导入包可预设，用户可自配。示例：

- sqlmap: `python3 sqlmap.py --version`
- nmap: `nmap --version`
- subfinder: `subfinder -version`

没配就只做目录级检测（⚠️ 未验证），不阻塞使用。

---

## UI 自定义

- 工具卡片支持拖拽排序、拖拽换分类（@dnd-kit/core + @dnd-kit/sortable）
- 每个分类可设主题色（卡片左边框色条区分）
- 字体/字号在设置里可调

---

## 数据模型

```typescript
interface Category {
  id: string;          // uuid
  name: string;        // 分类名
  sort_order: number;  // 排序权重，越小越靠前
}

interface Tool {
  id: string;          // uuid
  name: string;        // 工具名，如 "sqlmap"
  category_id: string; // 所属分类
  description?: string;// 简要说明
  icon?: string;       // 工具图标路径（用户可导入）
  commands: Command[];  // 预设启动命令列表（通常一条）
  note?: string;       // Markdown 笔记：使用技巧、参数备忘、示例命令
  install_command?: string; // 安装命令，首次执行一次，支持 {{TOOL_DIR}} {{DOWNLOAD_URL}} 变量
  download_url?: string;    // GitHub release 或源码地址
  verify_command?: string;  // 验证命令，如 "python3 sqlmap.py --version"，返回 0 = 就绪
}

interface Command {
  id: string;          // uuid
  label: string;       // 命令别名，如 "wizard 模式"
  command: string;     // 预设启动命令，如 "cd /opt/sqlmap && python3 sqlmap.py --wizard"
                       // 执行后用户在同一终端持续交互
}

interface AppSettings {
  default_categories: string[]; // 首次初始化用：开发、运维、数据、AI、安全和其他工具
  tool_root_dir: string;        // 统一工具目录，如 ~/CommandDeck/tools/
  download_proxy?: string;      // 下载代理，如 socks5://127.0.0.1:1080
  font_family?: string;         // 自定义字体
  font_size?: number;           // 字号
}
```

---

## 存储结构

数据文件位于 Tauri `app_data_dir` 下：
- `tools.json` — `Tool[]`，包含嵌套的 `commands`
- `categories.json` — `Category[]`
- `settings.json` — 主题、窗口尺寸等偏好（后期扩展）

---

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | Tauri 2.x |
| 后端语言 | Rust |
| 前端 | React 18 + TypeScript + Vite |
| 终端渲染 | xterm.js + xterm-addon-fit |
| pty | portable-pty（Rust crate） |
| 样式 | Tailwind CSS |
| 数据 | JSON（Tauri 文件系统 API） |

---

## 实现原理

```
前端 React                    后端 Rust
─────────────────────────────────────────
点击「运行」
  │
  ├─ invoke("create_pty", {command}) ──► 创建 pty 进程（portable-pty）
  │    command = "cd /opt/sqlmap && python3 sqlmap.py --wizard"
  │                                      pty 启动 shell，执行预设命令
  │                                      命令结束后 shell 保持存活，用户继续交互
  │                                      返回 pty_id
  │
  ├─ 建立 xterm.js 实例
  │
  ├─ xterm 输入 ──► invoke("write_pty", {pty_id, data})
  │                            写入 pty stdin（用户后续交互）
  │
  └─ listen("pty_output_{pty_id}") ◄── Rust event 推送 stdout
       │
       └─ xterm.write(data)

点击「停止」
  └─ invoke("kill_pty", {pty_id}) ──► SIGTERM 进程
```

数据读写直接用 Tauri `fs` API 操作本地 JSON 文件，无数据库。

---

## 目录结构

```
commanddeck/
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── main.rs             # 入口
│   │   ├── commands/
│   │   │   ├── pty.rs          # pty 创建/读写/销毁
│   │   │   └── storage.rs      # JSON 读写
│   │   └── state.rs            # 全局 pty 状态管理
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src/                        # React 前端
│   ├── components/
│   │   ├── Sidebar/            # 分类导航（纯锚点）
│   │   ├── ToolCatalog/        # 右侧工具目录（卡片网格）
│   │   ├── ToolCard/           # 单个工具卡片（图标+名称+简述+状态）
│   │   ├── TabBar/             # 标签页栏（分组标签）
│   │   ├── ToolDetail/         # 工具详情页（笔记+命令+终端）
│   │   ├── ToolForm/           # 新增/编辑表单
│   │   ├── Terminal/           # 终端（xterm.js）
│   │   └── CategoryManager/    # 分类管理
│   ├── store/                  # 全局状态（Zustand）
│   ├── types/                  # TypeScript 类型定义
│   ├── utils/                  # 工具函数
│   └── App.tsx
│
└── data/                       # 运行时数据（用户目录）
    ├── tools.json
    └── settings.json
```

---

## 实现步骤

### Step 1 — 项目初始化
```bash
npm create tauri-app@latest commanddeck -- --template react-ts
cd commanddeck
npm install xterm xterm-addon-fit zustand
```
Cargo.toml 添加依赖：`portable-pty`, `serde`, `serde_json`, `tokio`, `uuid`

### Step 2 — 数据层
- 定义 TypeScript 类型：`Tool`, `Command`, `Category`
- 实现 Rust storage.rs：`read_tools()`, `write_tools()`, `read_categories()`, `write_categories()`
- 注册 Tauri command，前端通过 `invoke` 调用

### Step 3 — 侧边栏 + 工具目录
- 左侧窄栏：只显示分类名，纯锚点导航，点击跳转到右侧对应分类区域
- 右侧主区域：按分类分组，每个分类下工具以卡片网格展示（图标 + 名称 + 简述 + 运行状态角标）
- 顶部搜索框实时过滤（输入关键字高亮匹配的工具卡片）
- 点击工具卡片进入工具详情页

### Step 4 — Tab 系统
- Zustand 管理 tabs 状态数组
- 每个 tab：`{ id, type, title, props }`
- TabBar 组件渲染标签，支持关闭
- 主区域根据 `tab.type` 渲染对应组件

### Step 5 — 工具详情 / 表单
- 工具详情页布局：上方为笔记区（优先展示），下方为启动命令列表
- 笔记区：渲染态显示 Markdown，编辑态用 textarea，渲染态中的代码块可一键复制
- 命令列表：每条命令有「▶ 运行」按钮，默认一条，可追加
- 新增/编辑表单，保存后写入 JSON，刷新侧边栏

### Step 6 — pty 终端
- Rust 端：`create_pty(command)` 启动进程，保存到 HashMap<String, PtyProcess>
- Rust 端：spawn 线程持续读取 stdout，通过 `app.emit("pty_output_{id}", data)` 推送前端
- 前端：xterm.js 渲染输出，`onData` 回调触发 `invoke("write_pty")`

### Step 7 — 分类管理 / 笔记 / UI
- 分类 CRUD，侧边栏分类拖拽排序
- 工具卡片拖拽排序、拖拽换分类（@dnd-kit/core + @dnd-kit/sortable）
- 分类主题色设置
- 笔记用 `react-markdown` 渲染，编辑态用 `<textarea>`

### Step 8 — 导入导出
- 导出：勾选工具 → 生成 `.commanddeck.json`
- 导入：拖入文件 → 预览 → 配置代理和目录 → 执行安装命令
- 安装模板选择 + 手动编辑
- `{{TOOL_DIR}}` `{{DOWNLOAD_URL}}` 变量替换

### Step 9 — 退出保护
- Tauri `onCloseRequested` 事件拦截
- 检查 pty HashMap 是否有存活进程
- 有则弹确认 dialog，确认后逐一 kill 再退出

---

## 编码规范

### 通用
- 所有文件使用 UTF-8
- 缩进：前端 2 空格，Rust 4 空格
- 提交信息：`feat:` / `fix:` / `chore:` 前缀

### TypeScript / React
- 严格模式：`tsconfig.json` 开启 `strict: true`
- 组件使用函数式组件 + Hooks，禁用 class 组件
- Props 必须定义 TypeScript interface
- 不使用 `any`，实在需要用 `unknown` + 类型收窄
- 组件文件与目录同名：`Terminal/Terminal.tsx`，目录下有 `index.ts` 统一导出
- 全局状态用 Zustand，组件内部状态用 `useState`
- Tauri invoke 调用统一封装在 `src/utils/tauri.ts`，不在组件里直接调用

### Rust
- 错误处理：使用 `Result<T, String>` 作为 Tauri command 返回类型
- pty 状态用 `Arc<Mutex<HashMap<String, PtyHandle>>>` 管理
- 避免 `unwrap()`，使用 `?` 或显式错误处理
- 每个模块职责单一：pty.rs 只管进程，storage.rs 只管文件读写

### 安全
- Tauri `tauri.conf.json` 中 `allowlist` 按最小权限配置，只开放实际用到的 API
- 不在前端硬编码任何路径，路径通过 Tauri `path` API 获取用户目录

---

## 依赖清单

### Rust (Cargo.toml)
```toml
[dependencies]
tauri = { version = "2", features = [] }
portable-pty = "0.8"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
uuid = { version = "1", features = ["v4"] }
```

### Node (package.json)
```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "xterm": "^5",
    "xterm-addon-fit": "^0.8",
    "zustand": "^4",
    "react-markdown": "^9",
    "@dnd-kit/core": "^6",
    "@dnd-kit/sortable": "^7"
  }
}
```

---

## 开发环境要求

- Node.js >= 18
- Rust >= 1.77（stable）
- Windows：需安装 WebView2 Runtime（Win11 自带）
- macOS：Xcode Command Line Tools
- Linux：`webkit2gtk`、`libgtk-3-dev`
