import type { PondAudio } from "../audio/pondAudio.ts";
import type { PondSimulation } from "../core/simulation.ts";
import type { Persister } from "../data/persist.ts";
import type { PondScene } from "../scene/scene.ts";

export type FeedOutcome = "fed" | "startled" | "busy";

export class Feeder {
  feedMode = true;
  private readonly sim: PondSimulation;
  private readonly scene: PondScene;
  private readonly audio: PondAudio;
  private readonly persister: Persister;

  constructor(sim: PondSimulation, scene: PondScene, audio: PondAudio, persister: Persister) {
    this.sim = sim;
    this.scene = scene;
    this.audio = audio;
    this.persister = persister;
  }

  feedAt(x: number, y: number): FeedOutcome {
    const scale = this.scene.scale;
    this.scene.startle(x, y);
    if (!this.feedMode) {
      this.scene.drop(x, y, 9 * scale, 0.9);
      this.sim.scare(x, y, 170 * scale);
      this.audio.tap();
      return "startled";
    }
    this.scene.drop(x, y, 7 * scale, 0.5);
    const before = this.sim.food.length;
    if (!this.sim.feed(x, y)) return "busy";
    for (const p of this.sim.food.slice(before)) this.scene.drop(p.x, p.y, 3 * scale, 0.22);
    this.audio.plop();
    this.persister.bumpFeed();
    return "fed";
  }
}
