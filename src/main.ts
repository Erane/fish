import "./style.css";
import {
  clamp,
  createFish,
  createSilverCarpShoal,
  DEFAULT_SETTINGS,
  PondSimulation,
  revive,
  sanitizeSave,
} from "./core/index.ts";
import type { Settings } from "./core/types.ts";
import { generateBed } from "./render/bedShapes.ts";
import { bedDepth, floatMask, paintBed } from "./render/bedPaint.ts";
import { buildSprites } from "./art/sprites.ts";
import { createRenderer } from "./render/renderer.ts";
import type { Renderer } from "./render/types.ts";
import { PondScene } from "./scene/scene.ts";
import { PondAudio } from "./audio/pondAudio.ts";
import { loadSave } from "./data/db.ts";
import { dayKey, Persister } from "./data/persist.ts";
import { Store } from "./ui/store.ts";
import { Shell } from "./ui/shell.ts";

const settings: Settings = { ...DEFAULT_SETTINGS };

const app = document.querySelector<HTMLDivElement>("#app")!;
const canvas = document.createElement("canvas");
canvas.id = "pond";
app.append(canvas);

const SEED = 7;
const shapes = generateBed(SEED);

let width = innerWidth;
let height = innerHeight;
const bedW = 1600;
const bedH = Math.max(2, Math.round((bedW * height) / width));
const bedCanvas = paintBed(shapes, bedW, bedH, 1);
const mask = floatMask(shapes, bedW, bedH);
const depth = bedDepth(shapes, bedW, bedH, SEED);

let renderer: Renderer | null = null;
let scene: PondScene | null = null;
let sim: PondSimulation | null = null;
let persister: Persister | null = null;
let shell: Shell | null = null;
let audio: PondAudio | null = null;

function resize(): void {
  width = innerWidth;
  height = innerHeight;
  const dpr = settings.quality === "eco" ? 1 : Math.max(1, Math.min(devicePixelRatio || 1, 2));
  if (sim) {
    sim.width = width;
    sim.height = height;
    sim.scale = clamp(Math.min(width, height) / 720, 0.66, 1.25);
  }
  renderer?.resize(width, height, dpr, settings.quality);
  scene?.layout(width, height);
}

let last = 0;
let time = 0;
let eaten = 0;
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
  last = now;
  time += dt;
  if (!sim || !renderer || !scene) return;
  sim.step(dt, settings.speed);
  if (sim.totalEaten !== eaten) {
    eaten = sim.totalEaten;
    audio?.gulp();
    persister?.schedule();
    shell?.noteEaten();
  }
  scene.setLook(settings.weather, settings.night, dt, settings.rainAmount, settings.snowAmount);
  scene.update(dt, settings);
  scene.draw();
  renderer.render(time, dt, scene.look);
}

async function boot(): Promise<void> {
  const saved = sanitizeSave(await loadSave());
  if (saved) Object.assign(settings, saved.settings);
  const fish = saved?.fish
    ? saved.fish.map((f) => revive(f))
    : [createFish(0), createFish(1), createFish(2), createFish(3), createFish(4)];
  sim = new PondSimulation(
    fish,
    width,
    height,
    Math.random,
    createSilverCarpShoal(),
    settings.silverCarp,
  );
  persister = new Persister(sim, settings);
  if (saved?.daily?.date === dayKey()) persister.daily = saved.daily;
  audio = new PondAudio();
  audio.configure(settings);
  const store = new Store(sim, settings, persister, resize, () => audio?.configure(settings));

  renderer = createRenderer(canvas, bedCanvas, buildSprites(), mask, depth, () => {
    location.reload();
  });
  if (!renderer) {
    app.textContent = "当前浏览器无法绘制池塘";
    return;
  }
  scene = new PondScene(renderer, sim);
  scene.onLightning = (k) => audio?.thunderAfter(0.4 + Math.random() * 2.2, k);
  shell = new Shell(app, sim, scene, persister, store, audio);
  shell.bind(canvas);
  addEventListener("resize", resize);
  resize();
  scene.setLook(settings.weather, settings.night, 0, settings.rainAmount, settings.snowAmount);
  scene.update(0, settings);
  requestAnimationFrame(frame);
}

void boot();
