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
import type { Interaction, Settings } from "./core/types.ts";
import { builtinBed, packBed } from "./render/pondBed.ts";
import type { PondBed } from "./render/pondBed.ts";
import { buildSprites } from "./art/sprites.ts";
import { buildPackSkins } from "./art/skin.ts";
import type { FishSkin } from "./art/skin.ts";
import type { SkinSpecies } from "./core/skins.ts";
import { createRenderer } from "./render/renderer.ts";
import { QUALITY_SPEC, tierDpr } from "./render/quality.ts";
import type { Renderer } from "./render/types.ts";
import { PondScene } from "./scene/scene.ts";
import { PondAudio } from "./audio/pondAudio.ts";
import { loadSave } from "./data/db.ts";
import { resolvePack } from "./data/packs.ts";
import { dayKey, Persister } from "./data/persist.ts";
import { WeatherSync } from "./data/weather.ts";
import { Store } from "./ui/store.ts";
import { Shell } from "./ui/shell.ts";
import { Feeder } from "./ui/feeder.ts";
import {
  bindWallpaperInput,
  inTauri,
  isWallpaper,
  syncInteraction,
  watchShellState,
} from "./ui/wallpaper.ts";
import { registerSW } from "virtual:pwa-register";

const settings: Settings = { ...DEFAULT_SETTINGS };

const app = document.querySelector<HTMLDivElement>("#app")!;
const canvas = document.createElement("canvas");
canvas.id = "pond";
const labels = document.createElement("canvas");
labels.id = "labels";
const labelCtx = labels.getContext("2d")!;
app.append(canvas, labels);

const SEED = 7;

let width = innerWidth;
let height = innerHeight;

let bed: PondBed = builtinBed(SEED, 1600, Math.max(2, Math.round((1600 * height) / width)));

let renderer: Renderer | null = null;
let scene: PondScene | null = null;
let sim: PondSimulation | null = null;
let persister: Persister | null = null;
let shell: Shell | null = null;
let audio: PondAudio | null = null;
let dpr = 1;
let labelDpr = 1;

function updateBoundary(): void {
  if (!sim || !renderer) return;
  if (!bed.boundary) {
    sim.boundary = null;
    return;
  }
  const poly: number[] = [];
  for (let i = 0; i < bed.boundary.length; i += 2) {
    const [sx, sy] = renderer.imageToScreen(
      bed.boundary[i]! * bed.bedW,
      bed.boundary[i + 1]! * bed.bedH,
    );
    poly.push(sx, sy);
  }
  sim.boundary = poly;
}

function resize(): void {
  width = innerWidth;
  height = innerHeight;
  dpr = tierDpr(settings.quality, devicePixelRatio || 1);
  labelDpr = Math.min(dpr, 2);
  labels.width = Math.round(width * labelDpr);
  labels.height = Math.round(height * labelDpr);
  if (sim) {
    sim.width = width;
    sim.height = height;
    sim.scale = clamp(Math.min(width, height) / 720, 0.66, 1.25);
  }
  renderer?.resize(width, height, dpr, settings.quality);
  scene?.layout(width, height);
  updateBoundary();
}

let labelsOn = false;
function drawLabels(): void {
  if (!sim) return;
  if (!settings.names) {
    if (labelsOn) {
      labelCtx.clearRect(0, 0, labels.width, labels.height);
      labelsOn = false;
    }
    return;
  }
  labelsOn = true;
  labelCtx.setTransform(labelDpr, 0, 0, labelDpr, 0, 0);
  labelCtx.clearRect(0, 0, width, height);
  labelCtx.font = '11px "LXGW WenKai","STKaiti","KaiTi",serif';
  labelCtx.textAlign = "center";
  labelCtx.lineJoin = "round";
  labelCtx.lineWidth = 3;
  labelCtx.strokeStyle = "rgba(34,52,45,.55)";
  labelCtx.fillStyle = "#fbf9ec";
  for (const f of sim.allFish) {
    const x = f.x * width;
    const y = f.y * height - 16 * f.size * sim.scale;
    labelCtx.strokeText(f.name, x, y);
    labelCtx.fillText(f.name, x, y);
  }
}

let last = 0;
let lastRender = 0;
let time = 0;
let eaten = 0;
function frame(now: number): void {
  requestAnimationFrame(frame);
  const hz = QUALITY_SPEC[settings.quality].frameHz;
  if (lastRender && now - lastRender < 1000 / hz - 1) return;
  const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
  last = now;
  lastRender = now;
  time += dt;
  if (!sim || !renderer || !scene) return;
  sim.step(dt, settings.speed);
  if (sim.totalEaten !== eaten) {
    eaten = sim.totalEaten;
    audio?.gulp();
    persister?.schedule();
    shell?.noteEaten();
  }
  scene.setLook(
    settings.weather,
    settings.night,
    dt,
    settings.rainAmount,
    settings.snowAmount,
    settings.caustic ? settings.causticAmount : 0,
  );
  scene.update(dt, settings);
  scene.draw(settings);
  renderer.render(time, dt, scene.look);
  drawLabels();
}

async function boot(): Promise<void> {
  const saved = sanitizeSave(await loadSave());
  if (saved) Object.assign(settings, saved.settings);
  let skins: Partial<Record<SkinSpecies, FishSkin>> = {};
  if (saved?.packId) {
    const resolved = await resolvePack(saved.packId, saved.skinBindings);
    if (resolved) {
      bed = packBed(resolved.pack, resolved.asset, resolved.image);
      skins = buildPackSkins(resolved.skins);
    }
  }
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
  persister.packId = saved?.packId;
  persister.skinBindings = saved?.skinBindings;
  if (saved?.daily?.date === dayKey()) persister.daily = saved.daily;
  audio = new PondAudio();
  audio.configure(settings);
  const store = new Store(sim, settings, persister, resize, () => audio?.configure(settings));
  const weatherSync = new WeatherSync(settings, (m) => {
    store.set("weather", m.weather);
    if (m.rainAmount !== undefined) store.set("rainAmount", m.rainAmount);
    if (m.snowAmount !== undefined) store.set("snowAmount", m.snowAmount);
  });
  weatherSync.start();

  renderer = createRenderer(
    canvas,
    bed.texture,
    buildSprites(),
    bed.mask,
    bed.depth,
    bed.water,
    () => {
      location.reload();
    },
  );
  if (!renderer) {
    app.textContent = "当前浏览器无法绘制池塘";
    return;
  }
  scene = new PondScene(renderer, sim, bed);
  scene.setSeasonTint(bed.tint);
  scene.setSkins(skins);
  scene.onLightning = (k) => audio?.thunderAfter(0.4 + Math.random() * 2.2, k);
  const wallpaper = isWallpaper();
  let applyMode: (mode: Interaction) => void;
  if (wallpaper) {
    const feeder = new Feeder(sim, scene, audio, persister, settings.interaction);
    canvas.addEventListener("pointerdown", (e) => {
      feeder.feedAt(e.clientX, e.clientY);
    });
    applyMode = (mode) => {
      feeder.mode = mode;
    };
  } else {
    shell = new Shell(app, sim, scene, persister, store, audio, weatherSync);
    shell.bind(canvas);
    applyMode = (mode) => shell?.setInteraction(mode);
  }
  if (inTauri()) {
    const sink = persister;
    watchShellState({
      onPondState: (alive) => {
        if (!wallpaper) return;
        sink.suspend(alive);
        if (!alive) location.reload();
      },
      onInteractionChanged: (mode) => {
        store.set("interaction", mode);
        applyMode(mode);
      },
    });
    if (wallpaper) {
      bindWallpaperInput();
      syncInteraction(settings.interaction);
    }
  } else {
    registerSW({ immediate: true });
  }
  addEventListener("resize", resize);
  resize();
  scene.setLook(
    settings.weather,
    settings.night,
    0,
    settings.rainAmount,
    settings.snowAmount,
    settings.caustic ? settings.causticAmount : 0,
  );
  scene.update(0, settings);
  requestAnimationFrame(frame);
}

void boot();
