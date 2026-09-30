import type { PondSimulation } from "../core/simulation.ts";
import type { Persister } from "../data/persist.ts";
import type { PondScene } from "../scene/scene.ts";
import type { PondAudio } from "../audio/pondAudio.ts";
import type { WeatherSync } from "../data/weather.ts";
import type { Interaction } from "../core/types.ts";
import { TOKENS } from "../style.ts";
import type { Store } from "./store.ts";
import { elem } from "./dom.ts";
import { Feeder } from "./feeder.ts";
import { inTauri, syncInteraction } from "./wallpaper.ts";
import { renderKoi, renderPond, renderRanking, renderSettings, renderWeather } from "./panels.ts";
import type { PanelCtx } from "./panels.ts";

type PanelKind = "koi" | "weather" | "pond" | "settings" | "ranking";

const TITLES: Record<PanelKind, string> = {
  koi: "我的锦鲤",
  weather: "池塘天气",
  pond: "池塘底图",
  settings: "池塘设置",
  ranking: "锦鲤食量榜",
};

const MODE_LABELS: Record<Interaction, string> = {
  feed: "喂鱼",
  startle: "惊扰",
  watch: "观鱼",
};

const NEXT_MODE: Record<Interaction, Interaction> = {
  feed: "startle",
  startle: "watch",
  watch: "feed",
};

const MODE_TOASTS: Record<Interaction, string> = {
  feed: "喂鱼模式 · 轻点水面撒食",
  startle: "惊扰模式 · 轻点水面，鱼儿会受惊游开",
  watch: "观鱼模式 · 点击不再打扰池塘",
};

export class Shell {
  private readonly feeder: Feeder;
  private readonly store: Store;
  private zen = false;
  private active: PanelKind | null = null;
  private readonly bar: HTMLDivElement;
  private readonly feedButton: HTMLButtonElement;
  private readonly soundButton: HTMLButtonElement;
  private readonly dialog: HTMLDialogElement;
  private readonly title: HTMLHeadingElement;
  private readonly content: HTMLDivElement;
  private readonly toastEl: HTMLDivElement;
  private readonly exitZen: HTMLButtonElement;
  private readonly panelButtons = new Map<PanelKind, HTMLButtonElement>();
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly root: HTMLElement;
  private readonly scene: PondScene;
  private readonly audio: PondAudio;
  private readonly ctx: PanelCtx;

  constructor(
    root: HTMLElement,
    sim: PondSimulation,
    scene: PondScene,
    persister: Persister,
    store: Store,
    audio: PondAudio,
    weatherSync: WeatherSync,
  ) {
    this.root = root;
    this.feeder = new Feeder(sim, scene, audio, persister, store.settings.interaction);
    this.store = store;
    this.scene = scene;
    this.audio = audio;

    this.feedButton = elem("button", {
      type: "button",
      class: "active",
      onclick: () => this.cycleInteraction(),
    });
    this.bar = elem("div", { class: "bar" }, this.feedButton);
    const labels: [PanelKind, string][] = [
      ["koi", "锦鲤"],
      ["weather", "天气"],
      ["pond", "底图"],
      ["ranking", "食量榜"],
      ["settings", "设置"],
    ];
    for (const [kind, label] of labels) {
      const button = elem("button", {
        type: "button",
        text: label,
        onclick: () => this.openPanel(kind),
      });
      this.panelButtons.set(kind, button);
      this.bar.append(button);
    }
    const zenButton = elem("button", {
      type: "button",
      text: "沉浸",
      onclick: () => this.setZen(true),
    });
    this.soundButton = elem("button", {
      type: "button",
      onclick: () => void this.toggleSound(),
    });
    this.bar.append(zenButton, this.soundButton);
    this.setSound(false);

    this.title = elem("h2");
    this.content = elem("div", { class: "panel-content" });
    const head = elem(
      "div",
      { class: "panel-head" },
      this.title,
      elem("button", { type: "button", text: "关闭", onclick: () => this.dialog.close() }),
    );
    this.dialog = elem("dialog", { class: "panel" }, head, this.content);
    this.dialog.addEventListener("close", () => this.setActive(null));

    this.toastEl = elem("div", { class: "toast" });
    this.exitZen = elem("button", {
      type: "button",
      class: "exit-zen",
      text: "退出沉浸",
      hidden: true,
      onclick: () => this.setZen(false),
    });

    this.ctx = {
      store,
      sim,
      scene,
      persister,
      weather: weatherSync,
      toast: (text) => this.toast(text),
      enterZen: () => {
        this.dialog.close();
        this.setZen(true, true);
      },
    };

    this.root.append(this.bar, this.dialog, this.toastEl, this.exitZen);
    for (const [key, value] of Object.entries(TOKENS))
      this.root.style.setProperty(`--${key}`, value);
    this.setInteraction(store.settings.interaction);
    this.bindShortcuts();
  }

  bind(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("pointerdown", (e) => this.feedAt(e.clientX, e.clientY));
  }

  private bindShortcuts(): void {
    addEventListener("keydown", (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.code === "Space" && !this.dialog.open) {
        e.preventDefault();
        this.feedAt(this.scene.w * 0.5, this.scene.h * 0.5);
      } else if (e.key === "Escape") {
        if (!this.dialog.open && this.zen) this.setZen(false);
      } else if (e.key.toLowerCase() === "h" && !this.dialog.open) {
        this.setZen(!this.zen);
      }
    });
  }

  setInteraction(mode: Interaction): void {
    this.feeder.mode = mode;
    this.feedButton.textContent = MODE_LABELS[mode];
  }

  private cycleInteraction(): void {
    const next = NEXT_MODE[this.feeder.mode];
    this.setInteraction(next);
    this.store.set("interaction", next);
    if (inTauri()) syncInteraction(next);
    this.toast(MODE_TOASTS[next]);
  }

  private setSound(on: boolean): void {
    this.soundButton.textContent = on ? "声音" : "静音";
    this.soundButton.classList.toggle("active", on);
    this.soundButton.setAttribute("aria-pressed", String(on));
  }

  private async toggleSound(): Promise<void> {
    const on = await this.audio.toggle();
    this.setSound(on);
    this.toast(on ? "水声与禅乐已开启" : "已静音");
  }

  feedAt(x: number, y: number): void {
    if (this.feeder.feedAt(x, y) === "busy") this.toast("鱼食还没吃完，让小鱼慢慢享用吧");
  }

  openPanel(kind: PanelKind): void {
    this.active = kind;
    this.title.textContent = TITLES[kind];
    for (const [key, button] of this.panelButtons) button.classList.toggle("active", key === kind);
    this.renderPanel();
    if (!this.dialog.open) this.dialog.showModal();
  }

  private setActive(kind: PanelKind | null): void {
    this.active = kind;
    for (const button of this.panelButtons.values()) button.classList.remove("active");
  }

  private renderPanel(): void {
    if (!this.active) return;
    const render = {
      koi: renderKoi,
      weather: renderWeather,
      pond: renderPond,
      settings: renderSettings,
      ranking: renderRanking,
    }[this.active];
    render(this.content, this.ctx);
  }

  noteEaten(): void {
    if (this.active === "ranking") this.renderPanel();
  }

  setZen(on: boolean, fullscreen = false): void {
    this.zen = on;
    this.root.classList.toggle("zen", on);
    this.exitZen.hidden = !on;
    if (on && fullscreen) void document.documentElement.requestFullscreen().catch(() => {});
    else if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove("show"), 2200);
  }
}
