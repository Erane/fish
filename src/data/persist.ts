import type { PondSimulation } from "../core/simulation.ts";
import type { DailyCount, SanitizedSave, Settings, StoredFish } from "../core/types.ts";
import { writeSave } from "./db.ts";

export function dayKey(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA");
}

export class Persister {
  daily: DailyCount = { date: dayKey(), count: 0 };
  private readonly sim: PondSimulation;
  private readonly settings: Settings;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(sim: PondSimulation, settings: Settings) {
    this.sim = sim;
    this.settings = settings;
  }

  snapshot(): SanitizedSave {
    const fish: StoredFish[] = this.sim.fish.map(
      ({ id, name, palette, size, seed, eaten, marks }) => ({
        id,
        name,
        palette,
        size,
        seed,
        eaten,
        marks,
      }),
    );
    return { fish, settings: { ...this.settings }, daily: { ...this.daily } };
  }

  schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void writeSave(this.snapshot()).catch(() => {});
    }, 500);
  }

  bumpFeed(): void {
    if (this.daily.date !== dayKey()) this.daily = { date: dayKey(), count: 0 };
    this.daily.count += 1;
    this.schedule();
  }
}
