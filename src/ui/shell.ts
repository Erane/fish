import { PALETTES } from "../core/palette.ts";
import type { PondSimulation } from "../core/simulation.ts";
import type { Persister } from "../data/persist.ts";
import type { PondScene } from "../scene/scene.ts";
import { TOKENS } from "../style.ts";

export class Shell {
  feedMode = true;
  private readonly bar: HTMLDivElement;
  private readonly feedButton: HTMLButtonElement;
  private readonly dialog: HTMLDialogElement;
  private readonly title: HTMLHeadingElement;
  private readonly content: HTMLDivElement;
  private readonly toastEl: HTMLDivElement;
  private rankingOpen = false;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly root: HTMLElement;
  private readonly sim: PondSimulation;
  private readonly scene: PondScene;
  private readonly persister: Persister;

  constructor(root: HTMLElement, sim: PondSimulation, scene: PondScene, persister: Persister) {
    this.root = root;
    this.sim = sim;
    this.scene = scene;
    this.persister = persister;
    this.bar = document.createElement("div");
    this.bar.className = "bar";
    this.feedButton = document.createElement("button");
    this.feedButton.type = "button";
    this.feedButton.addEventListener("click", () => this.toggleFeedMode());
    const rankButton = document.createElement("button");
    rankButton.type = "button";
    rankButton.textContent = "食量榜";
    rankButton.addEventListener("click", () => this.openRanking());
    this.bar.append(this.feedButton, rankButton);

    this.dialog = document.createElement("dialog");
    this.dialog.className = "panel";
    const head = document.createElement("div");
    head.className = "panel-head";
    this.title = document.createElement("h2");
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "关闭";
    close.addEventListener("click", () => this.dialog.close());
    head.append(this.title, close);
    this.content = document.createElement("div");
    this.content.className = "panel-content";
    this.dialog.append(head, this.content);
    this.dialog.addEventListener("close", () => {
      this.rankingOpen = false;
    });

    this.toastEl = document.createElement("div");
    this.toastEl.className = "toast";
    this.root.append(this.bar, this.dialog, this.toastEl);
    for (const [key, value] of Object.entries(TOKENS))
      this.root.style.setProperty(`--${key}`, value);
    this.setFeedMode(true);
  }

  bind(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("pointerdown", (e) => this.feedAt(e.clientX, e.clientY));
    canvas.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        this.feedAt(this.scene.w * 0.5, this.scene.h * 0.5);
      }
    });
  }

  setFeedMode(on: boolean): void {
    this.feedMode = on;
    this.feedButton.textContent = on ? "投喂中" : "观鱼中";
    this.feedButton.classList.toggle("active", on);
    this.feedButton.setAttribute("aria-pressed", String(on));
  }

  toggleFeedMode(): void {
    this.setFeedMode(!this.feedMode);
    this.toast(this.feedMode ? "投喂已开启，轻点水面试试" : "观鱼模式 · 轻点水面，鱼儿会受惊游开");
  }

  feedAt(x: number, y: number): void {
    const scale = this.scene.scale;
    if (!this.feedMode) {
      this.scene.drop(x, y, 9 * scale, 0.9);
      this.sim.scare(x, y, 170 * scale);
      return;
    }
    this.scene.drop(x, y, 7 * scale, 0.5);
    const before = this.sim.food.length;
    if (!this.sim.feed(x, y)) {
      this.toast("鱼食还没吃完，让小鱼慢慢享用吧");
      return;
    }
    for (const p of this.sim.food.slice(before)) this.scene.drop(p.x, p.y, 3 * scale, 0.22);
    this.persister.bumpFeed();
  }

  openRanking(): void {
    this.rankingOpen = true;
    this.title.textContent = "锦鲤食量榜";
    this.renderRanking();
    if (!this.dialog.open) this.dialog.showModal();
  }

  noteEaten(): void {
    if (this.rankingOpen) this.renderRanking();
  }

  private renderRanking(): void {
    const total = this.sim.fish.reduce((n, f) => n + f.eaten, 0);
    this.content.replaceChildren();
    const summary = document.createElement("p");
    summary.className = "panel-summary";
    summary.textContent = `一共吃掉了 ${total} 粒鱼食 · 今日投喂 ${this.persister.daily.count} 次`;
    const list = document.createElement("div");
    list.className = "ranking-list";
    [...this.sim.fish]
      .sort((a, b) => b.eaten - a.eaten)
      .forEach((f, i) => {
        const row = document.createElement("div");
        row.className = "rank-row";
        const num = document.createElement("span");
        num.className = "rank-number";
        num.textContent = String(i + 1).padStart(2, "0");
        const info = document.createElement("div");
        info.className = "rank-info";
        const name = document.createElement("span");
        name.textContent = f.name;
        const kind = document.createElement("small");
        kind.textContent = PALETTES[f.palette]!.name;
        info.append(name, kind);
        const score = document.createElement("div");
        score.className = "rank-score";
        score.textContent = `${f.eaten} 粒`;
        row.append(num, info, score);
        list.append(row);
      });
    this.content.append(summary, list);
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove("show"), 2200);
  }
}
