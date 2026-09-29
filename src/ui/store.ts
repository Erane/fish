import { createFish } from "../core/fish.ts";
import { cleanKoiName } from "../core/save.ts";
import type { PondSimulation } from "../core/simulation.ts";
import type { Fish, FishMark, Settings } from "../core/types.ts";

export interface PersistSink {
  schedule(): void;
}

export interface NewKoi {
  name: string;
  palette: number;
  size: number;
  seed: number;
  marks: FishMark[];
}

export const KOI_LIMIT = 60;

export class Store {
  readonly settings: Settings;
  private readonly sim: PondSimulation;
  private readonly sink: PersistSink;
  private readonly applyQuality: () => void;
  private readonly applyAudio: () => void;

  constructor(
    sim: PondSimulation,
    settings: Settings,
    sink: PersistSink,
    applyQuality: () => void,
    applyAudio: () => void,
  ) {
    this.sim = sim;
    this.settings = settings;
    this.sink = sink;
    this.applyQuality = applyQuality;
    this.applyAudio = applyAudio;
  }

  get fish(): Fish[] {
    return this.sim.fish;
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.settings[key] = value;
    if (key === "silverCarp") this.sim.residentsOn = value as boolean;
    if (key === "quality") this.applyQuality();
    this.applyAudio();
    this.sink.schedule();
  }

  addKoi(spec: NewKoi): boolean {
    if (this.sim.fish.length >= KOI_LIMIT) return false;
    const fish = createFish(this.sim.fish.length);
    fish.name = cleanKoiName(spec.name) || fish.name;
    fish.palette = spec.palette;
    fish.size = spec.size;
    fish.seed = spec.seed;
    fish.marks = spec.marks.map((m) => ({ ...m }));
    this.sim.fish.push(fish);
    this.sink.schedule();
    return true;
  }

  releaseKoi(fish: Fish): boolean {
    const i = this.sim.fish.indexOf(fish);
    if (i < 0 || this.sim.fish.length <= 1) return false;
    this.sim.fish.splice(i, 1);
    this.sink.schedule();
    return true;
  }

  renameKoi(fish: Fish, name: string): void {
    const clean = cleanKoiName(name);
    if (clean) fish.name = clean;
    this.sink.schedule();
  }
}
