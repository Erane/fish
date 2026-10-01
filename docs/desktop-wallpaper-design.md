# Windows 桌面壁纸版 · 设计

知鱼的 Windows 桌面外壳：单个 exe 双击即用，池塘垫在桌面图标之下铺满全部屏幕，可直接在桌面投喂，不影响桌面正常使用。网页层复用现有 PWA 产物，原生层为 Tauri 2（WebView2，Windows 11 自带运行时）。

## 已定决策

| 决策点   | 结论                                                                                 |
| -------- | ------------------------------------------------------------------------------------ |
| 壁纸交互 | 三种交互模式：喂鱼（撒食）/ 惊扰（惊鱼游开）/ 观鱼（关闭钩子，桌面零干扰），托盘切换 |
| 分发形态 | 单个自包含 exe，双击即用，默认开机自启（托盘可关）                                   |
| 外壳技术 | Tauri 2 + WebView2；Rust 承载挂载、钩子、托盘                                        |

## 架构

同一个前端应用、两种宿主形态：

- **壁纸窗口**：外壳主窗口，无边框、不可聚焦、不进任务栏，铺满整个虚拟桌面（多显示器是一整片连续池塘，鱼跨屏游动），由 Rust 挂载到桌面层。
- **池塘窗口**：托盘「打开池塘」时创建的普通窗口，即现有 PWA 形态，完整交互。

前端通过运行环境探测（存在 `__TAURI_INTERNALS__`）加窗口标签（`wallpaper`/`pond`）区分形态，壁纸模式隐藏 UI 面板、跳过 Service Worker 注册（`vite.config.ts` 的 `injectRegister: "null"`，`src/main.ts` 手动注册）。渲染、仿真、音频、存档全部复用，前端改动：

- 点击交互收在 `src/ui/feeder.ts`（`Feeder`，按 `Settings.interaction` 三模式分派，观鱼模式零反应），Shell 与壁纸模式共用同一实现
- 外壳桥接 `src/ui/wallpaper.ts`：环境探测、外壳事件监听、合成指针事件
- `vite.config.ts` 的 `base` 由 `/fish/` 改为 `./`，一份 dist 同时服务 GitHub Pages 与 Tauri（PWA manifest 的 `start_url`/`scope` 已是相对写法）

## 子系统一：桌面挂载

1. 向 Progman 窗口发送 `0x052C` 消息可促使系统在静态壁纸与图标层之间派生 WorkerW。
2. 挂载父窗口按优先级选取：经典结构（某 WorkerW 宿主图标层 `SHELLDLL_DefView`）取其 Z 序后继；否则取 Progman 之下（Z 序后继顶层窗口中）第一个**可见且覆盖虚拟屏**的 WorkerW——标准算法，兼容图标层宿主 Progman 的变体与被第三方软件重组的桌面（WorkerW 类被大量非壁纸窗口复用，2026-10-01 实测两台机器常驻 14/21 个无宿主 WorkerW，多为 136x39 隐藏小窗，几何护栏挡住误挂）；仍无则发 `0x052C` 派生（记录派生前后 WorkerW 差异数）并重选；最后兜底 Progman 直接子层的可见 WorkerW。全部落空即挂载失败，日志 dump 全部 WorkerW 几何与 DefView 归属供远程定位。候选父窗口必须覆盖虚拟屏（子窗口绘制被父窗口裁剪，挂进小窗等于不可见）；不做 Progman 直挂（实测新桌面栈下 Progman 直接子层被壁纸视觉整体覆盖，挂了也不可见）。
3. 先按虚拟桌面坐标摆好顶层窗口再 `SetParent`，消除子窗口坐标系歧义；挂载成功即 `show` 并 `sink`（`HWND_BOTTOM`，抵消 show 提层），进程声明 PerMonitorV2 DPI 感知。混合 DPI 多屏下跨度窗口只能按单一 DPI 渲染，若实测画面发虚则降级为每屏一窗（同挂一个 WorkerW）。
4. **重挂载守护（2 秒轮询，连续失败后退避至 10 秒）**：窗口失联（壁纸轮换、聚焦壁纸切换、explorer 重启都会导致）或桌面层缺失时自动重挂；窗口死亡则销毁记录、以递增标签（`wallpaper`、`wallpaper-1`…）重建；每次恢复顺带重注册托盘图标（explorer 重启会吞掉托盘）。外壳日志写入 `%LOCALAPPDATA%\zhiyu\shell.log`（UTF-8，连续重复行自动折叠），记录挂载路径判定、派生结果与失败原因。
5. 24H2 兼容事实：机制未被废弃，但行为随构建漂移——24H2 初期破坏过壁纸类应用（微软确认），各应用以重挂载逻辑恢复兼容；本机 Insider 构建（26220）已移除 `0x052C` 派生（初始化期高频重发亦无效）且壁纸视觉覆盖 Progman 子层，生产版 24H2/25H2 的 WorkerW 机制不受影响。

## 子系统二：输入转发

壁纸窗口位于图标层之下，收不到鼠标消息，由外壳转发：

1. `WH_MOUSE_LL` 全局低级鼠标钩子，仅在交互模式非「观鱼」时安装（观鱼 = 桌面零干扰），专用线程消息泵驱动，切到观鱼即摘钩。
2. 事件判定：`WindowFromPoint` 取鼠标下的窗口，`GetAncestor(GA_ROOT)` 的根窗口类为 Progman/WorkerW 即视为桌面层，转发点击。**严禁向 explorer 跨进程发送带指针的控件消息**（曾用 `LVM_HITTEST` 判定图标命中，本地指针在 explorer 地址空间解引用导致 comctl32.dll 访问违例、explorer 崩溃循环，2026-09-30 真机确诊后移除）。代价：点桌面图标时池塘同步起涟漪（真实点击仍由图标层接收，操作不受影响）。
3. 只转发左键按下（现有交互只消费按下，移动/右键留给桌面原生行为），坐标经虚拟屏原点换算为窗口本地坐标，经 Tauri 事件给前端输入桥合成 `pointerdown`。
4. 回调内只做只读判定与事件发送，不做重活，避免触发钩子超时被系统摘除；检测到摘除自动重装。

## 外壳生命周期与真相源

- 单实例（tauri-plugin-single-instance），重复双击不开新进程。
- 托盘菜单：打开池塘、重新投放鱼群（广播 `respawn-fish`，前端执行 `PondSimulation.respawn`，见 `src/core/simulation.ts`）、交互模式（喂鱼/惊扰/观鱼三选一子菜单）、开机自启开关、退出。交互默认喂鱼，自启默认开。
- 真相源（不新增第二套存储）：
  - 池塘数据 → 前端 IndexedDB（`src/data/db.ts`），零改动。
  - 交互模式 → 前端 `Settings.interaction`（类型 `Interaction` 定义于 `src/core/types.ts`）唯一真相。托盘三选一或池塘窗口按钮发起：Rust 执行钩子启停并回显托盘、广播 `interaction-changed`；前端应用并持久化，壁纸窗口存活期由池塘窗口担当唯一写入者（沿用 `pond-state` 挂起规则）；前端经 `set_wallpaper_mode` 命令回发，事件监听只应用不回传，防回环。
  - 开机自启 → tauri-plugin-autostart，真相源即系统 Run 键，托盘直接读写。
- 多窗口写入保护：托盘「打开池塘」时壁纸与池塘两个 WebView 共用同一 IndexedDB，都写存档会互相覆盖。约定池塘窗口存活期间它是唯一写入者——Rust 在池塘窗口创建/销毁时广播 `pond-state`，壁纸窗口挂起写入（`Persister.suspend`）并在池塘关闭后重载读回权威存档。
- WebView2 启动参数附加 `--autoplay-policy=no-user-gesture-required`（壁纸无用户手势），音量沿用应用内设置。

## 项目结构与构建

Tauri 默认布局恰为前端在根 + `src-tauri/` 在根，与现有仓库零冲突（pnpm-workspace.yaml 未定义 packages）。`tauri.conf.json` 的 `frontendDist` 指向 `../dist`；图标由 `scripts/gen-icons.mjs` 产物经 `pnpm tauri icon` 生成。构建：`pnpm tauri build` 产出自包含单 exe（`src-tauri/target/release/Zhiyu.exe`）。

Rust 模块：`src-tauri/src/desktop.rs`（挂载与健康检查）、`src-tauri/src/input.rs`（钩子转发）、`src-tauri/src/lib.rs`（窗口、托盘、自启、单实例）。

## 错误处理

- WebView2 运行时缺失（仅极老系统）：原生消息框引导下载。
- 挂载失败：窗口保持隐藏、仅托盘驻留，**绝不覆盖桌面**（全屏降级会劫持图标与操作，禁止）；池塘可从托盘以普通窗口打开，守护持续重试挂载。
- 钩子被系统摘除：检测返回值，自动重装。
- 前端异常不做自动重启，真机验证稳定性后再议（不做过度兜底）。

## 测试

- 单元：虚拟屏到窗口本地坐标换算（含多屏负坐标）、WorkerW 选窗逻辑（`cargo test`）、指针事件合成桥与交互三模式分派（观鱼零反应，`pnpm test`）。
- 真机清单（本机为 Windows 11 Insider 构建，已验证）：挂载到 WorkerW 时池塘垫在图标之下、图标不受影响、降级全屏可用且可投喂、explorer 死亡→重启全程守护自动恢复且无窗口泄漏、自启注册、单实例、托盘切换三模式即时生效（观鱼时点桌面无涟漪、喂鱼/惊扰恢复转发）。
- 待 Win10 真机复验（2026-10-01 用户反馈机，1920x1200，v0.2.1 起）：桌面常驻 14 个无宿主 WorkerW 且 0x052C 派生无新增，v0.2.1 的 B 分支/dump 首次跑通后看日志定论。
- 待生产版 24H2/25H2 验证：图标之下状态的钩子转发投喂（本机 Insider 已无壁纸层，无法复现该状态）。
