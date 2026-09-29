# 知鱼

> 子非鱼，安知鱼之乐。——《庄子·秋水》

一方池塘作桌面。知鱼是一个可交互的锦鲤池塘动态壁纸（PWA），在浏览器中即开即用，也可安装到桌面全屏运行。

在线体验：<https://erane.github.io/fish/>

## 功能特性

- **锦鲤**：七种花色（红白、大正三色、黄金、白写、丹顶、墨鲤、纯红）程序化生成，脊柱式游动仿真；可添加、命名、手绘花纹、放生，头顶可显示名字
- **池塘生灵**：青鲢鱼群与锦鲤混游，乌龟浮沉换气，螃蟹栖石受惊潜水，白日蝶蜓、入夜流萤
- **投喂互动**：轻点水面投喂或惊鱼，鱼儿争食、受惊游开，锦鲤食量榜记录总食量与每日投喂
- **天气**：晴、多云、雨、雪，可调雨雪量，荷叶积雪；可接入 [Open-Meteo](https://open-meteo.com/) 同步所选城市实时天气；月下观鱼倒映真实月相
- **音效**：Web Audio 实时合成，无音频文件——溪流、山泉、叠石、静池、竹筒惊鹿等水声，雨滴、鸟鸣、蛙声、远雷等天气音，古琴、颂钵、风铃禅乐
- **池塘包**：导入自定义底图与水域范围，配以 AI 生成或自制鱼皮肤，数据格式见 [docs/pond-pack-schema.md](docs/pond-pack-schema.md)
- **体验细节**：本地自动存档（IndexedDB）、PWA 安装与离线使用、30/60 帧品质档适配设备性能

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

推送 `main` 分支后，GitHub Actions（[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）自动构建并发布至 GitHub Pages。Vite `base` 指向 `/fish/`，与仓库名保持一致。

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
| `docs/`       | 池塘包数据格式等设计文档                             |

## 灵感来源

本项目灵感来自 [moli-xia/fishwallpaper](https://github.com/moli-xia/fishwallpaper)：素材形式（锦鲤花色、池塘小动物、天气与音效设定）与交互方式（轻点水面投喂、食量榜、月下观鱼等）保留自源仓库；代码为 TypeScript + Vite 的完全重写与重构，未采用源仓库代码。
