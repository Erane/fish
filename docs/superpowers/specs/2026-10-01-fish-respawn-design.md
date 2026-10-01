# 鱼群受困自救与重新投放 设计

日期：2026-10-01 · 状态：已确认

## 问题

用户报告：鱼游进角落出不来、堆叠，惊扰也无效。

根因（均在 core，与渲染无关）：

1. `scanHeading`（`src/core/navigator.ts`）：探测方向的开放度 `g` 被 clamp 到 `[-1,1]`，四面受阻时所有方向饱和为 `-1`，权重只余 DRIFT/HAND 项，结果指向"当前朝向偏 15°"——即继续顶墙；向量完全抵消时回退分支（原 `l <= 1e-6` 返回当前朝向）同样顶墙。
2. `scare`（`src/core/simulation.ts`）：逃离方向 = 背向点击点，鱼在角落时该方向指向墙内。
3. 反应式转向无寻路能力，凹形池塘包（用户自制多边形）存在局部极小值，鱼可能长期受困。

## 设计

### 核心修复（src/core）

- **navigator**：扫描循环记录净空最大的方向；当没有任何方向达到"开阔"（bestQ < room）或权重向量抵消时，返回该方向。有开阔方向时权重路径不变（现有测试行为保持）。
- **scare**：算出逃离角后经 `scanHeading`（以逃离角为基准）校正，前方受阻则沿墙偏向开阔侧。
- **受困自救**：`Fish` 新增 `checkT/checkX/checkY`（`src/core/types.ts` 唯一定义，`makeFish` 初始化）。每 2–4 秒检查一次位移，位移 < 0.4 体长且不在休息/逃跑时触发 `escape`：目标重定向到全池最开阔采样点，并借 `flee` 通道给 1.1 秒窜逃。
- **采样去重**：`pickGoal` 的 room 采样提取为 `openSpot`（净空最大点），`pickGoal`/`escape`/`respawn` 共用。
- 堆叠不单独修：是受困的果，能游出即散开。

### 重新投放（手动逃生门）

- `PondSimulation.respawn()`：对 `allFish` 逐条用 `openSpot` 落位（与已落位鱼保持 ≥ 0.7×身长和的间距），重置角度/速度/目标/逃逸/休息与受困检查状态。原地修改 Fish，场景层 WeakMap 键不变，渲染零改动；位置不入存档，无持久化影响。
- 入口一（浏览器/PWA）：设置面板底部操作行加"重新投放鱼群"按钮（`renderSettings`），toast 确认。
- 入口二（桌面）：托盘菜单加"重新投放鱼群"项（`src-tauri/src/lib.rs`），广播 `respawn-fish` 事件；`watchShellState` 增加 `onRespawn`，`main.ts` 接线执行 `respawn()`，池塘窗口附带 toast。

## 测试

- `tests/navigator.test.ts`：四面受阻（净空 < room 的微型口袋场）时返回净空最大的方向。
- `tests/core.test.ts`：角落惊扰的逃离方向净空优于原始背向角；顶在角落的鱼数秒内自行离开 ≥ 2 体长；`respawn` 后全员落位开阔、彼此间距达标、行为状态重置。

## 边界

不改存档格式、不加设置项、不引入寻路、不动渲染层；托盘菜单与 `desktop-wallpaper-design.md` 同步一行索引。
