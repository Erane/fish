import { PALETTES } from "../core/palette.ts";
import { BODY } from "../core/fish.ts";
import type { Fish, Quality, Weather } from "../core/types.ts";
import type { PondSimulation } from "../core/simulation.ts";
import type { Persister } from "../data/persist.ts";
import type { PondScene } from "../scene/scene.ts";
import { fishSprite } from "../art/koi.ts";
import type { Store } from "./store.ts";
import { KOI_LIMIT } from "./store.ts";
import { controlRow, elem, slider, toggle } from "./dom.ts";

export interface PanelCtx {
  store: Store;
  sim: PondSimulation;
  scene: PondScene;
  persister: Persister;
  toast(text: string): void;
  enterZen(): void;
}

const WEATHERS: [Weather, string][] = [
  ["sunny", "晴日"],
  ["cloudy", "多云"],
  ["rain", "下雨"],
  ["snow", "落雪"],
];

function thumbnail(f: Fish, ppu = 1.6): HTMLCanvasElement {
  const c = fishSprite({ palette: f.palette, seed: f.seed, marks: f.marks }, ppu);
  c.className = "fish-thumb";
  return c;
}

export function renderRanking(content: HTMLElement, ctx: PanelCtx): void {
  const total = ctx.sim.fish.reduce((n, f) => n + f.eaten, 0);
  content.replaceChildren(
    elem("p", {
      class: "panel-summary",
      text: `一共吃掉了 ${total} 粒鱼食 · 今日投喂 ${ctx.persister.daily.count} 次`,
    }),
    elem(
      "div",
      { class: "ranking-list" },
      ...[...ctx.sim.fish]
        .sort((a, b) => b.eaten - a.eaten)
        .map((f, i) =>
          elem(
            "div",
            { class: "rank-row" },
            elem("span", { class: "rank-number", text: String(i + 1).padStart(2, "0") }),
            thumbnail(f),
            elem(
              "div",
              { class: "rank-info" },
              elem("span", { text: f.name }),
              elem("small", { text: PALETTES[f.palette]!.name }),
            ),
            elem(
              "div",
              { class: "rank-score" },
              elem("span", { text: String(f.eaten) }),
              elem("small", { text: "粒" }),
            ),
          ),
        ),
    ),
  );
}

export function renderWeather(content: HTMLElement, ctx: PanelCtx): void {
  const s = ctx.store.settings;
  const options = elem("div", { class: "weather-options" });
  const select = (weather: Weather): void => {
    ctx.store.set("weather", weather);
    for (const b of Array.from(options.children))
      b.classList.toggle("selected", (b as HTMLElement).dataset.weather === weather);
  };
  for (const [value, label] of WEATHERS)
    options.append(
      elem("button", {
        type: "button",
        class: `weather-option${s.weather === value ? " selected" : ""}`,
        "data-weather": value,
        "aria-pressed": String(s.weather === value),
        text: label,
        onclick: () => select(value),
      }),
    );
  content.replaceChildren(
    options,
    controlRow(
      "月下观鱼",
      "夜色里，池中倒映今夜的月亮",
      toggle(s.night, "月下观鱼", (v) => ctx.store.set("night", v)),
    ),
    controlRow(
      "雨量",
      "下雨时生效",
      slider(s.rainAmount, 0, 1, 0.05, "雨量", (v) => ctx.store.set("rainAmount", v)),
    ),
    controlRow(
      "雪量",
      "落雪时生效，荷叶上会渐渐积雪",
      slider(s.snowAmount, 0, 1, 0.05, "雪量", (v) => ctx.store.set("snowAmount", v)),
    ),
  );
}

export function renderSettings(content: HTMLElement, ctx: PanelCtx): void {
  const s = ctx.store.settings;
  const quality = elem(
    "select",
    {
      "aria-label": "画面品质",
      onchange: (e) => ctx.store.set("quality", (e.target as HTMLSelectElement).value as Quality),
    },
    elem("option", { value: "high", text: "细腻 · 60 帧", selected: s.quality === "high" }),
    elem("option", { value: "eco", text: "节能 · 30 帧", selected: s.quality === "eco" }),
  );
  content.replaceChildren(
    controlRow(
      "游动速度",
      "慢一点，也是一种生活",
      slider(s.speed, 0.3, 2, 0.1, "游动速度", (v) => ctx.store.set("speed", v)),
    ),
    controlRow(
      "青鲢鱼",
      "银鳞结伴，穿梭于锦鲤之间",
      toggle(s.silverCarp, "青鲢鱼", (v) => ctx.store.set("silverCarp", v)),
    ),
    controlRow("画面品质", "节能模式限制至 30 帧", quality),
    elem(
      "div",
      { class: "form-actions" },
      elem("span", { class: "small-note", text: "锦鲤和投喂记录会自动保存在此设备" }),
      elem("button", {
        type: "button",
        class: "secondary",
        text: "全屏观鱼",
        onclick: () => ctx.enterZen(),
      }),
    ),
  );
}

interface Draft {
  name: string;
  palette: number;
  size: number;
  seed: number;
  marks: { x: number; y: number; r: number; color: string }[];
}

export function renderKoi(content: HTMLElement, ctx: PanelCtx): void {
  const grid = elem("div", { class: "fish-grid" });
  const count = elem("span", { class: "panel-summary" });

  const drawGrid = (): void => {
    count.textContent = `我的锦鲤 · ${ctx.sim.fish.length} / ${KOI_LIMIT} 尾`;
    grid.replaceChildren();
    for (const f of ctx.sim.fish) grid.append(koiTile(f, ctx, drawGrid));
  };

  const draft: Draft = {
    name: "",
    palette: 0,
    size: 0.8,
    seed: Math.floor(Math.random() * 1e5),
    marks: [],
  };
  const painter = buildPainter(draft);
  const nameInput = elem("input", {
    type: "text",
    class: "koi-name",
    placeholder: "取个名字",
    maxlength: 12,
    "aria-label": "锦鲤名字",
    oninput: (e) => {
      draft.name = (e.target as HTMLInputElement).value;
    },
  });
  const addForm = elem(
    "form",
    {
      class: "add-koi",
      onsubmit: (e) => {
        e.preventDefault();
        if (!ctx.store.addKoi(draft)) {
          ctx.toast(`池塘最多容纳 ${KOI_LIMIT} 尾锦鲤`);
          return;
        }
        ctx.toast(`${ctx.sim.fish[ctx.sim.fish.length - 1]!.name} 已游入池塘`);
        draft.name = "";
        draft.marks = [];
        draft.seed = Math.floor(Math.random() * 1e5);
        nameInput.value = "";
        painter.refresh();
        drawGrid();
      },
    },
    painter.canvas,
    elem(
      "div",
      { class: "add-controls" },
      nameInput,
      palettePicker(draft, painter.refresh),
      controlRow(
        "体型",
        "大小",
        slider(draft.size, 0.5, 1.2, 0.01, "体型", (v) => {
          draft.size = v;
        }),
      ),
      elem(
        "div",
        { class: "form-actions" },
        elem("button", {
          type: "button",
          class: "secondary",
          text: "换个花纹",
          onclick: () => {
            draft.seed = Math.floor(Math.random() * 1e5);
            painter.refresh();
          },
        }),
        elem("button", {
          type: "button",
          class: "secondary",
          text: "擦除手绘",
          onclick: () => {
            draft.marks = [];
            painter.refresh();
          },
        }),
        elem("button", { type: "submit", text: "放入池塘" }),
      ),
    ),
  );

  content.replaceChildren(count, grid, addForm);
  drawGrid();
  painter.refresh();
}

function palettePicker(draft: Draft, refresh: () => void): HTMLElement {
  const row = elem("div", { class: "palette-picker" });
  const paint = (): void => {
    for (const b of Array.from(row.children))
      b.classList.toggle("selected", Number((b as HTMLElement).dataset.index) === draft.palette);
  };
  PALETTES.forEach((p, i) => {
    const swatch = elem("button", {
      type: "button",
      class: `swatch${i === draft.palette ? " selected" : ""}`,
      "data-index": i,
      "aria-label": p.name,
      title: p.name,
      onclick: () => {
        draft.palette = i;
        paint();
        refresh();
      },
    });
    swatch.style.setProperty("--base", p.base);
    swatch.style.setProperty("--spot", p.spot);
    row.append(swatch);
  });
  return row;
}

function buildPainter(draft: Draft): { canvas: HTMLElement; refresh: () => void } {
  const ppu = 3;
  const canvas = elem("canvas", {
    class: "koi-preview",
    width: BODY.width * ppu,
    height: BODY.half * 2 * ppu,
  });
  const color = elem("input", {
    type: "color",
    class: "paint-color",
    value: "#df4935",
    "aria-label": "手绘颜色",
  });
  let painting = false;

  const refresh = (): void => {
    fishSprite({ palette: draft.palette, seed: draft.seed, marks: draft.marks }, ppu, canvas);
  };

  const stamp = (e: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const cy = ((e.clientY - rect.top) * canvas.height) / rect.height;
    const x = cx / ppu + BODY.left;
    const y = cy / ppu - BODY.half;
    if (Math.abs(x) > 40 || Math.abs(y) > 16 || draft.marks.length >= 400) return;
    draft.marks.push({ x, y, r: 3, color: color.value });
    refresh();
  };

  canvas.addEventListener("pointerdown", (e) => {
    painting = true;
    canvas.setPointerCapture(e.pointerId);
    stamp(e);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (painting) stamp(e);
  });
  canvas.addEventListener("pointerup", () => {
    painting = false;
  });

  return { canvas: elem("div", { class: "painter" }, canvas, color), refresh };
}

function koiTile(f: Fish, ctx: PanelCtx, redraw: () => void): HTMLElement {
  const name = elem("span", { class: "koi-tile-name", text: f.name });
  const edit = elem("button", { type: "button", class: "tile-btn", text: "改名" });
  const release = elem("button", { type: "button", class: "tile-btn release", text: "放生" });
  let armed: ReturnType<typeof setTimeout> | undefined;
  let input: HTMLInputElement | null = null;

  const commit = (): void => {
    if (!input) return;
    ctx.store.renameKoi(f, input.value);
    ctx.toast("名字已保存");
    redraw();
  };

  edit.addEventListener("click", () => {
    if (input) {
      commit();
      return;
    }
    input = elem("input", {
      type: "text",
      class: "koi-tile-input",
      value: f.name,
      maxlength: 12,
      "aria-label": "锦鲤新名字",
    });
    name.replaceWith(input);
    edit.textContent = "保存";
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
    });
    input.focus();
    input.select();
  });

  release.addEventListener("click", () => {
    if (!armed) {
      release.textContent = "确认放生";
      release.classList.add("armed");
      armed = setTimeout(() => {
        armed = undefined;
        release.textContent = "放生";
        release.classList.remove("armed");
      }, 3000);
      return;
    }
    clearTimeout(armed);
    if (ctx.store.releaseKoi(f)) {
      ctx.scene.forget(f);
      ctx.toast(`「${f.name}」已放生，愿它自在悠游`);
      redraw();
    } else ctx.toast("池塘里至少留一尾锦鲤");
  });

  return elem(
    "div",
    { class: "fish-tile" },
    thumbnail(f, 1.4),
    elem(
      "div",
      { class: "fish-tile-foot" },
      name,
      elem("div", { class: "fish-actions" }, edit, release),
    ),
  );
}
