# CommandDeck v0.1.2

CommandDeck v0.1.2 是首个公开预览版之后的稳定性更新，也是替代 `v0.1.1` 失败构建的发布候选。

## 更新内容

- 工具支持自定义图标，可使用本地图片或 URL，并在没有图标时继续显示名称首字母。
- PTY 清理扩展到 CommandDeck 管理的完整进程树：Unix 使用独立 session，Windows 使用 Job Object；关闭应用或终端时会清理纳管范围内的根进程与后代进程。
- 加固 Unix 进程归属安全：root watcher 通过 `waitid(..., WNOWAIT)` 保留未 reap 根进程作为 SID 所有权锚点，session 清空后才 reap；锚点意外丢失时 fail-closed，避免把复用 SID 下的无关进程误认为 CommandDeck 所有。
- 完善 PTY 自然退出、主动关闭和重启失败语义：监听建立后才启动输出，退出事件至多发送一次，清理失败保留可重试状态。
- 前端输出或退出监听注册失败时会立即清理刚创建的 PTY，避免监听未建立却留下后台会话。
- 资源栏按 CommandDeck 实际纳管的进程范围统计 CPU、内存、进程数和线程数，减少无关同名进程干扰。
- 补充进程范围、自然退出、清理幂等、启动闸门和句柄释放等 Rust 测试，并将 CI 的 Cargo 检查固定到锁文件。
- 补齐 Windows 原生 Job/进程句柄 API 所需的 `Win32_System_Threading` feature，修复 `v0.1.1` Windows 构建缺少相关 API 绑定的问题。

## 安装与已知风险

- 本次候选安装包尚未进行代码签名或 macOS 公证。macOS 和 Windows 可能显示来源或安全提示，请只从本仓库下载并核对来源。
- Windows 上仍存在一个很小的 `spawn → Job Object` 绑定窗口：根进程在加入 Job 前理论上可能立即创建后代，使该后代未被 Job 追踪。当前实现会清理成功纳管的完整进程树，后续版本将继续收紧这一创建竞态。
- `v0.1.2` tag push 触发 Actions；Actions 完成四平台构建与资产覆盖校验后先创建 Draft。核验构建结果和资产后，再将该 Draft 发布为 Pre-release。当前不声称已经完成跨平台实机安装验证。
