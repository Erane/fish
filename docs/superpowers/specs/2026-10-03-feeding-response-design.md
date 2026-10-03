# 进食感知两相模型 设计

日期：2026-10-03 · 状态：已确认

## 背景与范围

用户反馈：向池塘边缘投喂后，全池鱼同刻朝饲料缓慢游动，场面诡异。核实为四个机制叠加：感知半径 `max(w,h)×appetite`（0.55-1.0）≈ 全池、落食数秒内全员获知且无信息传播；进食分支等速行军（want 封顶 2.2L、temper 不调制、路径无 wander）；锁定即 `depthGoal→0.04-0.39` 全池同时上浮；青鲢随群心漂移。本稿覆盖前三项根修（`src/core/simulation.ts` 目标获取与进食分支），青鲢群心维持现状观察。承接 [2026-10-02 碰撞优化设计](2026-10-02-fish-collision-liveliness-design.md) 的 C3 喂食仲裁，claims 惩罚与单趟扫描保留，感知半径由全池改两相。

## 模型：嗅觉 / 锁定两相（step() 目标获取单趟内）

- **嗅觉（smell）**：化学感知全池级，`smellReach = span×1.25`（span=max(w,h)）；门 `p.age > react×2 + d/650`。达标后将 `f.goal` 锚定最近颗粒（goalTime=2 逐帧续期），走既有巡游分支——wanderAmp 自然弯道、depthBand 惯常水层不变；`foodGlow>0` 时巡游 want×1.6。
- **锁定（lock-on）**：视觉冲刺，`lockReach = span×(0.16+0.2×appetite)`；门 `p.age > react×(觉醒?0.3:1) + d/650`。达标走既有 target 冲刺分支。
- **波前觉醒（foodGlow）**：锁定者 glow=3s、嗅觉者 glow≥1.2s、sdt 衰减；8 体长内有发光邻居即觉醒——lockReach×2、react×0.3，冲刺传染、由近及远传播。
- **进食个体化**：`feedDrive` 由持久化 seed 派生（0.75-1.25，与 temper 同模式）乘锁定 want；`appetite` 区间放宽至 0.35-1.0（锁定半径个体差 ~2 倍，参与时序分化）。
- **深度渐变**：锁定后 `depthGoal = surfaceBand×(1-t) + temper.depthBand×t`，`t = clamp((fd-2L)/8L)`——近食贴水面争食、远处保持惯常水层，替换原锁定即贴水面。

## 数据与性能

`Fish` 新增运行时字段 `feedDrive/foodGlow`（`src/core/types.ts` 唯一定义），不入 `StoredFish`；`respawn()` 清 glow，存档格式零变更。觉醒预扫 O(n²) 早退，量级与既有邻域扫描相同。

## 测试契约（tests/core.test.ts「进食感知」组）

1. 分时响应：近鱼秒级锁定冲食；远鱼（锁定半径外）始终无 target、朝食物净移动、depthGoal 均值保持惯常层；近鱼上浮显著深差。
2. 两相感知：锁定半径外无 target 但 goal 锚定颗粒（<10px）；移入半径后转锁定。
3. 个体化：同布局 feedDrive 0.75/1.25 冲食位移与速度显著分化；派生区间受控。
4. 觉醒传播：8 体长内有食客时远鱼 1.5s 内锁定；无食客对照同距未锁定。

既有契约不回退：单鱼吃完、40 组随机点位吃完、多鱼抢食深度分层、食物上限过期、boundary 一小时顶墙阈值（feedDrive 改 seed 派生避免随机流移位，无食物路径逐位不变）。
