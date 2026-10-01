import type { PondAudio } from "../audio/pondAudio.ts";
import { pointInPoly } from "../core/boundary.ts";
import type { PondSimulation } from "../core/simulation.ts";
import type { Interaction } from "../core/types.ts";
import type { Persister } from "../data/persist.ts";
import type { PondScene } from "../scene/scene.ts";

export type FeedOutcome = "fed" | "startled" | "busy" | "ignored";

export class Feeder {
  mode: Interaction;
  private readonly sim: PondSimulation;
  private readonly scene: PondScene;
  private readonly audio: PondAudio;
  private readonly persister: Persister;

  constructor(
    sim: PondSimulation,
    scene: PondScene,
    audio: PondAudio,
    persister: Persister,
    mode: Interaction,
  ) {
    this.sim = sim;
    this.scene = scene;
    this.audio = audio;
    this.persister = persister;
    this.mode = mode;
  }

  feedAt(x: number, y: number): FeedOutcome {
    if (this.mode === "watch") return "ignored";
    if (this.sim.boundary && !pointInPoly(x, y, this.sim.boundary)) return "ignored";
    const scale = this.scene.scale;
    this.scene.startle(x, y);
    if (this.mode === "startle") {
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
