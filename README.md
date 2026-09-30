# 知鱼

> 子非鱼，安知鱼之乐。——《庄子·秋水》

一方池塘作桌面。知鱼是一个可交互的锦鲤池塘动态壁纸（PWA），在浏览器中即开即用，也可安装到桌面全屏运行，或下载 [Windows 桌面版](#windows-桌面壁纸版) 把池塘铺满真实桌面。

在线体验：<https://erane.github.io/fish/> ｜ Windows 下载：[安装版][setup] · [绿色版][portable]

## 功能特性

- **锦鲤**：七种花色（红白、大正三色、黄金、白写、丹顶、墨鲤、纯红）程序化生成，脊柱式游动仿真；可添加、命名、手绘花纹、放生，头顶可显示名字
- **池塘生灵**：青鲢鱼群与锦鲤混游，乌龟浮沉换气，螃蟹栖石受惊潜水，白日蝶蜓、入夜流萤
- **投喂互动**：轻点水面投喂或惊鱼，鱼儿争食、受惊游开，锦鲤食量榜记录总食量与每日投喂
- **天气**：晴、多云、雨、雪，可调雨雪量，荷叶积雪；可接入 [Open-Meteo](https://open-meteo.com/) 同步所选城市实时天气；月下观鱼倒映真实月相
- **音效**：Web Audio 实时合成，无音频文件——溪流、山泉、叠石、静池、竹筒惊鹿等水声，雨滴、鸟鸣、蛙声、远雷等天气音，古琴、颂钵、风铃禅乐
- **池塘包与皮肤库**：导入自定义底图与水域范围，AI 生成或自制的鱼皮肤入库后按池塘、季节绑定到锦鲤与银鲩，数据格式见 [docs/pond-pack-schema.md](docs/pond-pack-schema.md)
- **体验细节**：本地自动存档（IndexedDB）、PWA 安装与离线使用、30/60 帧品质档适配设备性能

## 自定义池塘教程

用 AI 把任意风格的池塘俯视图变成你的桌面池塘，全程在顶栏「池塘」面板内完成：

1. **生成背景图**：点击「复制背景图生成提示词」，把提示词交给任意文生图 AI（如即梦、DALL·E、Gemini），得到一张俯视的池塘图。提示词里可自由追加季节与画风，例：「中国风，秋天的季节，适用于电脑大屏幕壁纸」。
2. **底图解析**：点击「复制底图解析提示词」，把**提示词和刚生成的图片一起**发给任意多模态 AI（这一步是看图分析，不是生图），让它输出池塘包 JSON。
3. **贴入 JSON 并解析**：回到「池塘」面板，在「导入池塘包」文本框粘贴 JSON（或选择 `.json` 文件），点击「解析」。校验通过会提示已解析的包名与季节。
4. **上传底图**：解析成功后会出现每个季节的底图选择框，为各季节选中对应的图片。
5. **导入启用**：点击「导入」（勾选「导入后立即启用」则自动应用），页面重载后即可在你的池塘里养鱼。同一 `id` 再次导入即为更新，未重新选图的季节保留原底图。

鱼皮肤同理：「复制鱼皮肤提示词」让 AI 画一张透明背景、鼻朝右的鱼贴图，在面板「皮肤库」上传图片导入，再在池塘包的编辑区把皮肤绑定到锦鲤或银鲩。数据格式与更多细节见 [docs/pond-pack-schema.md](docs/pond-pack-schema.md)。

## 技术栈

TypeScript · Vite（vite-plus）· WebGL2（GPU 波动方程水面模拟）· Web Audio · IndexedDB · vite-plugin-pwa · 无运行时依赖

## 快速开始

环境要求：Node.js ≥ 20（CI 使用 24）、pnpm ≥ 12（项目通过 `devEngines` 固定版本，缺失时自动下载）。

```bash
pnpm install
pnpm dev        # 启动本地开发服务器
```

## 构建与测试

```bash
pnpm build      # tsc 类型检查 + 构建，产物输出至 dist/
pnpm preview    # 本地预览构建产物
pnpm test       # 运行单元测试
pnpm icons      # 重新生成应用图标
```

## 部署

推送 `main` 分支后，GitHub Actions（[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）自动构建并发布至 GitHub Pages。Vite `base` 为相对路径，与网页版共用一份构建产物。

## Windows 桌面壁纸版

免安装直接用，提供两种形态，链接永远指向最新发布版：

| | 安装版 | 绿色版 |
| | --- | --- |
| 下载 | [zhiyu-win-setup.exe][setup] | [zhiyu-win-portable.zip][portable] |
| 使用 | 双击安装，从开始菜单启动 | 解压到任意文件夹，双击其中 `zhiyu.exe` |
| 卸载 | 系统「设置 → 应用」中卸载 | 直接删除文件夹 |
| 适合 | 日常长期使用（推荐大多数用户） | 不想安装软件、或放 U 盘携带演示 |

两版存档（池塘、鱼、皮肤）都保存在系统应用数据目录（`%LOCALAPPDATA%` 下按应用标识 `io.github.erane.zhiyu`），不随程序文件夹走：卸载重装数据保留；绿色版拷去另一台电脑则从空池塘开始。运行依赖 WebView2 运行库：Win11 系统自带，Win10 多随 Edge 自动更新已具备；安装版缺失时会联网自动补装，绿色版需自行安装 WebView2 Runtime。

发布物由 [.github/workflows/release-desktop.yml](.github/workflows/release-desktop.yml) 在推送 `v*` tag 时自动构建并创建 Release（也可在 Actions 页手动触发）。

[setup]: https://github.com/Erane/fish/releases/latest/download/zhiyu-win-setup.exe
[portable]: https://github.com/Erane/fish/releases/latest/download/zhiyu-win-portable.zip

### 本地构建

`pnpm tauri build` 产出安装版（`src-tauri/target/release/bundle/nsis/`）与自包含绿色 exe（`src-tauri/target/release/zhiyu.exe`，约 9 MB），构建环境要求 Rust + MSVC。桌面行为：池塘垫在桌面图标之下铺满全部屏幕，桌面空白处可直接交互，托盘在喂鱼/惊扰/观鱼三种模式间切换（观鱼时点击不惊扰池塘），托盘常驻（打开池塘 / 交互模式 / 开机自启 / 退出），默认开机自启。设计详见 [docs/desktop-wallpaper-design.md](docs/desktop-wallpaper-design.md)。

## 项目结构

| 目录          | 职责                                                 |
| ------------- | ---------------------------------------------------- |
| `src/core/`   | 领域模型与仿真：鱼、鱼群、边界、深度、天气、存档清洗 |
| `src/render/` | WebGL 渲染：水面模拟、池底、贴图、画质分层           |
| `src/art/`    | 程序化素材：锦鲤贴图、皮肤归一化、小动物绘制         |
| `src/scene/`  | 场景编排：天气光照、月亮、浮游物、小动物             |
| `src/audio/`  | Web Audio 合成音效                                   |
| `src/ui/`     | 界面：面板、交互、设置状态                           |
| `src/data/`   | IndexedDB 持久化、池塘包、天气数据、提示词           |
| `src-tauri/`  | Windows 壁纸外壳：桌面挂载、鼠标钩子转发、托盘       |
| `docs/`       | 池塘包数据格式、桌面壁纸版设计文档                   |

## 灵感来源

本项目灵感来自 [moli-xia/fishwallpaper](https://github.com/moli-xia/fishwallpaper)：素材形式（锦鲤花色、池塘小动物、天气与音效设定）与交互方式（轻点水面投喂、食量榜、月下观鱼等）保留自源仓库；代码为 TypeScript + Vite 的完全重写与重构，未采用源仓库代码。

## 许可证

本项目基于 [MIT](LICENSE) 协议开源。
