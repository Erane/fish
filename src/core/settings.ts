import type { Settings } from "./types.ts";

// 设置的唯一默认值源：仅用于「该键在存档里缺失或不合法」时兜底（main.ts 先铺默认再 Object.assign 存档）。
// 存档一旦写入某键（persist.ts 全量落盘），改这里的值对老设备无效，只对新设备或清档生效。
// 合法区间与枚举由 core/save.ts 的 sanitizeSettings 校验，超出区间会被 clamp。
export const DEFAULT_SETTINGS: Settings = {
  weather: "sunny", // sunny | cloudy | rain | snow；autoWeather 为真时被城市实时天气覆盖
  speed: 1, // 鱼群游动速度倍率，存档合法区间 0.3~2
  turtles: true, // 乌龟：浮沉换气
  crabs: true, // 螃蟹：栖石，受惊潜入水中
  silverCarp: true, // 青鲢鱼群：开启后才构建银鲩编队（main.ts 建 sim 时读取）
  butterflies: true, // 蝴蝶与蜻蜓，夜间转为流萤
  names: false, // 锦鲤头顶名字标签，默认关闭以保持纯观赏
  quality: "high", // ultra | high | eco；决定 dpr 上限、像素上限与帧率上限（render/quality.ts QUALITY_SPEC），eco 为 30 帧
  autoWeather: false, // 跟随 location 所填城市的实时天气，开启后写入 weather/rainAmount/snowAmount
  location: null, // 自动天气的城市 { name, latitude, longitude }；null 表示未选城市
  night: false, // 月下观鱼：夜色与月面反光
  caustic: false, // 水底焦散反光总开关；关闭时 causticAmount 按 0 参与渲染
  causticAmount: 1, // 焦散强度，0~1
  water: true, // 水声总开关
  waterType: "stream", // stream 溪流 | spring 山泉 | cascade 叠石 | lapping 拍岸 | bamboo 竹泉
  waterVol: 0.6, // 水声音量 0~1，叠在 volume 主音量之下
  weatherSound: true, // 天气音（雨滴、鸟鸣、蛙声、远雷）
  weatherVol: 0.6, // 天气音量 0~1
  music: "guqin", // guqin 古琴 | bowl 颂钵 | chimes 风铃 | off 关闭
  musicVol: 0.5, // 禅乐音量 0~1
  sfx: true, // 音效：投喂、进食、点水
  volume: 0.7, // 主音量 0~1，作用于水声/天气/禅乐/音效四条总线
  rainAmount: 0.5, // 雨量 0~1，仅 weather=rain 时可见效果
  snowAmount: 0.5, // 雪量 0~1，仅 weather=snow 时生效，荷叶会渐积雪
  interaction: "feed", // feed 喂鱼 | startle 惊扰 | watch 观鱼；桌面点击行为，不在设置面板内切换
};
