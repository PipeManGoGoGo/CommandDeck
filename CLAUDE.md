# SecBox 开发约定

项目背景、架构和功能设计见 `SecBox_DEV_GUIDE.md`。

## 常用验证命令

```bash
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## 修改原则

- 保持 React、Zustand、Tauri command 和 Rust 模块之间的既有边界。
- 工具与分类数据继续使用可读 JSON，并保持写入可恢复。
- PTY 生命周期必须覆盖创建、监听、重启、关闭和应用退出。
- 跨平台命令需同时考虑 macOS/Linux Shell 与 Windows PowerShell。
- 修改保持小而可验证，不添加未进入实际流程的占位功能。
