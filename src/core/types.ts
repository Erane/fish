export type FishKind =
  | "kohaku"
  | "sanke"
  | "ogon"
  | "utsuri"
  | "tancho"
  | "karasu"
  | "benigoi"
  | "silvercarp";

export interface Palette {
  name: string;
  base: string;
  spot: string;
  second?: string;
  fin: string;
  kind: FishKind;
}

export interface FishMark {
  x: number;
  y: number;
  r: number;
  color: string;
}

export interface StoredFish {
  id: string;
  name: string;
  palette: number;
  size: number;
  seed: number;
  eaten: number;
  marks: FishMark[];
}

export interface Goal {
  x: number;
  y: number;
}

export interface Fish extends StoredFish {
  species?: "silvercarp";
  x: number;
  y: number;
  angle: number;
  phase: number;
  speed: number;
  v: number;
  turn: number;
  thrust: number;
  amp: number;
  beating: boolean;
  depth: number;
  depthGoal: number;
  goal: Goal | null;
  goalTime: number;
  rest: number;
  flee: number;
  fleeAngle: number;
  cruise: number;
  react: number;
  appetite: number;
  spine: Float32Array | null;
  spineSeg: number;
}

export interface Food {
  x: number;
  y: number;
  life: number;
  age: number;
  drift: number;
  vx: number;
  vy: number;
  eaten: boolean;
}

export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

export interface EatEvent {
  type: "eat";
  x: number;
  y: number;
  fish: Fish;
}

export interface DepthField {
  w: number;
  h: number;
  data: ArrayLike<number>;
}

export type Weather = "sunny" | "cloudy" | "rain" | "snow";
export const QUALITIES = ["ultra", "high", "eco"] as const;
export type Quality = (typeof QUALITIES)[number];
export type WaterType = "stream" | "spring" | "cascade" | "lapping" | "bamboo";
export type Music = "guqin" | "bowl" | "chimes" | "off";

export interface GeoLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export interface Settings {
  weather: Weather;
  speed: number;
  turtles: boolean;
  crabs: boolean;
  silverCarp: boolean;
  butterflies: boolean;
  names: boolean;
  quality: Quality;
  autoWeather: boolean;
  location: GeoLocation | null;
  night: boolean;
  caustic: boolean;
  causticAmount: number;
  water: boolean;
  waterType: WaterType;
  waterVol: number;
  weatherSound: boolean;
  weatherVol: number;
  music: Music;
  musicVol: number;
  sfx: boolean;
  volume: number;
  rainAmount: number;
  snowAmount: number;
  wallpaperInput: boolean;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface SanitizedSave {
  fish: StoredFish[];
  settings: Partial<Settings>;
  daily?: DailyCount;
  packId?: string;
}
