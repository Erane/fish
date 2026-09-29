import { PALETTES } from "../core/palette.ts";
import { BODY } from "../core/fish.ts";
import { parsePack } from "../core/pack.ts";
import type { PondPack, Season } from "../core/pack.ts";
import type { Fish, Music, Quality, WaterType, Weather } from "../core/types.ts";
import type { PondSimulation } from "../core/simulation.ts";
import type { Persister } from "../data/persist.ts";
import { writeSave } from "../data/db.ts";
import { importPack, listPacks, removePack } from "../data/packs.ts";
import type { SkinSpecies } from "../data/packs.ts";
import { PACK_PROMPT, SKIN_PROMPT } from "../data/packPrompt.ts";
import type { WeatherSync } from "../data/weather.ts";
import type { PondScene } from "../scene/scene.ts";
import { fishSprite } from "../art/koi.ts";
import type { Store } from "./store.ts";
import { KOI_LIMIT } from "./store.ts";
import { confirmButton, controlRow, copyText, elem, select, slider, toggle } from "./dom.ts";

export interface PanelCtx {
  store: Store;
  sim: PondSimulation;
  scene: PondScene;
  persister: Persister;
  weather: WeatherSync;
  toast(text: string): void;
  enterZen(): void;
}

const WEATHERS: [Weather, string][] = [
  ["sunny", "晴日"],
  ["cloudy", "多云"],
  ["rain", "下雨"],
  ["snow", "落雪"],
];

const QUALITIES: [Quality, string][] = [
  ["ultra", "极致 · 原生分辨率"],
  ["high", "细腻 · 60 帧"],
  ["eco", "节能 · 30 帧"],
];

const WATERS: [WaterType, string][] = [
  ["stream", "溪流"],
  ["spring", "山泉"],
  ["cascade", "叠石"],
  ["lapping", "静池"],
  ["bamboo", "竹筒惊鹿"],
];

const MUSICS: [Music, string][] = [
  ["guqin", "古琴"],
  ["bowl", "颂钵"],
  ["chimes", "风铃"],
  ["off", "无"],
];

const SEASON_LABELS: Record<Season, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

const SPECIES_LABELS: Record<SkinSpecies, string> = {
  koi: "锦鲤皮肤",
  silvercarp: "银鲩皮肤",
};

function seasonSummary(pack: PondPack): string {
  return (Object.keys(pack.seasons) as Season[]).map((s) => SEASON_LABELS[s]).join(" · ");
}

function promptBlock(
  label: string,
  summary: string,
  text: string,
  toast: (msg: string) => void,
): HTMLElement {
  return elem(
    "div",
    { class: "pack-prompt" },
    elem("button", {
      type: "button",
      class: "secondary",
      text: label,
      onclick: () => {
        void copyText(text).then((ok) =>
          toast(ok ? `${label}已复制` : "复制失败，请展开下方全文手动复制"),
        );
      },
    }),
    elem(
      "details",
      {},
      elem("summary", { text: summary }),
      elem("textarea", { readonly: true, rows: 10, value: text }),
    ),
  );
}

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
  const info = elem("div", { class: "panel-summary" });
  const results = elem("div", { class: "city-results" });

  const paintOptions = (): void => {
    for (const b of Array.from(options.children)) {
      const on = (b as HTMLElement).dataset.weather === s.weather;
      b.classList.toggle("selected", on);
      b.setAttribute("aria-pressed", String(on));
    }
  };
  const syncInfo = (): void => {
    const c = ctx.weather.current;
    if (s.autoWeather && s.location)
      info.textContent = c
        ? `${s.location.name} · ${Math.round(c.temperature)}°C · 风速 ${Math.round(c.wind)} km/h`
        : `${s.location.name} · 等待天气数据`;
    else if (s.autoWeather) info.textContent = "尚未选择城市";
    else info.textContent = "手动天气 · 由你说了算";
  };

  const pick = (weather: Weather): void => {
    autoBox.checked = false;
    ctx.store.set("autoWeather", false);
    ctx.store.set("weather", weather);
    paintOptions();
    syncInfo();
  };
  for (const [value, label] of WEATHERS)
    options.append(
      elem("button", {
        type: "button",
        class: `weather-option${s.weather === value ? " selected" : ""}`,
        "data-weather": value,
        "aria-pressed": String(s.weather === value),
        text: label,
        onclick: () => pick(value),
      }),
    );

  const autoBox = toggle(s.autoWeather, "跟随城市天气", (v) => {
    if (v && !s.location) {
      autoBox.checked = false;
      ctx.toast("先选择一个城市，再跟随它的天气");
      return;
    }
    ctx.store.set("autoWeather", v);
    if (v)
      void ctx.weather.refresh().then((ok) => {
        if (!ok) ctx.toast("暂时取不到城市天气，稍后再试");
        paintOptions();
        syncInfo();
      });
    else syncInfo();
  });

  const input = elem("input", {
    type: "text",
    class: "city-input",
    placeholder: "搜索城市名",
    "aria-label": "城市名",
    maxlength: 40,
  });
  let controller: AbortController | null = null;
  const searchForm = elem("form", {
    class: "city-search",
    onsubmit: (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      controller?.abort();
      controller = new AbortController();
      results.replaceChildren(elem("span", { class: "small-note", text: "搜索中…" }));
      void ctx.weather
        .search(q, controller.signal)
        .then((list) => {
          if (!list.length) {
            results.replaceChildren(
              elem("span", { class: "small-note", text: "没有找到相关城市" }),
            );
            return;
          }
          results.replaceChildren(
            ...list.map((loc) =>
              elem("button", {
                type: "button",
                class: "city-result",
                text: loc.name,
                onclick: () => {
                  ctx.store.set("location", loc);
                  results.replaceChildren();
                  input.value = "";
                  ctx.toast(`已选择「${loc.name}」`);
                  if (s.autoWeather)
                    void ctx.weather.refresh().then(() => {
                      paintOptions();
                      syncInfo();
                    });
                  else syncInfo();
                },
              }),
            ),
          );
        })
        .catch(() => {
          results.replaceChildren(
            elem("span", { class: "small-note", text: "网络异常，稍后再试" }),
          );
        });
    },
  });
  searchForm.append(input, elem("button", { type: "submit", text: "搜索" }));

  content.replaceChildren(
    options,
    info,
    controlRow("跟随城市天气", "自动同步所选城市的实时天气", autoBox),
    searchForm,
    results,
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
  syncInfo();
}

export function renderSettings(content: HTMLElement, ctx: PanelCtx): void {
  const s = ctx.store.settings;
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
    controlRow(
      "显示名字",
      "在锦鲤头顶描出它的名字",
      toggle(s.names, "显示名字", (v) => ctx.store.set("names", v)),
    ),
    controlRow(
      "乌龟",
      "浮沉换气，悠游于池底",
      toggle(s.turtles, "乌龟", (v) => ctx.store.set("turtles", v)),
    ),
    controlRow(
      "螃蟹",
      "栖于石上，受惊则潜入水中",
      toggle(s.crabs, "螃蟹", (v) => ctx.store.set("crabs", v)),
    ),
    controlRow(
      "蝶与蜓",
      "白日蝴蝶蜻蜓，入夜化作流萤",
      toggle(s.butterflies, "蝶与蜓", (v) => ctx.store.set("butterflies", v)),
    ),
    controlRow(
      "画面品质",
      "节能模式限制至 30 帧",
      select(s.quality, QUALITIES, "画面品质", (v) => ctx.store.set("quality", v)),
    ),
    controlRow(
      "主音量",
      "",
      slider(s.volume, 0, 1, 0.05, "主音量", (v) => ctx.store.set("volume", v)),
    ),
    controlRow(
      "水声",
      "溪流、山泉、叠石或静池",
      toggle(s.water, "水声", (v) => ctx.store.set("water", v)),
    ),
    controlRow(
      "水声类型",
      "",
      select(s.waterType, WATERS, "水声类型", (v) => ctx.store.set("waterType", v)),
    ),
    controlRow(
      "水声音量",
      "",
      slider(s.waterVol, 0, 1, 0.05, "水声音量", (v) => ctx.store.set("waterVol", v)),
    ),
    controlRow(
      "天气音",
      "雨滴、鸟鸣、蛙声与远雷",
      toggle(s.weatherSound, "天气音", (v) => ctx.store.set("weatherSound", v)),
    ),
    controlRow(
      "天气音量",
      "",
      slider(s.weatherVol, 0, 1, 0.05, "天气音量", (v) => ctx.store.set("weatherVol", v)),
    ),
    controlRow(
      "禅乐",
      "古琴、颂钵或风铃",
      select(s.music, MUSICS, "禅乐", (v) => ctx.store.set("music", v)),
    ),
    controlRow(
      "禅乐音量",
      "",
      slider(s.musicVol, 0, 1, 0.05, "禅乐音量", (v) => ctx.store.set("musicVol", v)),
    ),
    controlRow(
      "音效",
      "投喂、进食与点水的声音",
      toggle(s.sfx, "音效", (v) => ctx.store.set("sfx", v)),
    ),
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

export function renderPond(content: HTMLElement, ctx: PanelCtx): void {
  const list = elem("div", { class: "pack-list" });

  const enable = (id: string | undefined): void => {
    ctx.persister.packId = id;
    void writeSave(ctx.persister.snapshot()).then(() => location.reload());
  };

  const defaultRow = (): HTMLElement => {
    const active = !ctx.persister.packId;
    return elem(
      "div",
      { class: `pack-row${active ? " active" : ""}` },
      elem(
        "div",
        { class: "pack-info" },
        elem("span", { text: "默认池塘" }),
        elem("small", { text: "程序生成 · 赛璐璐" }),
      ),
      active
        ? elem("span", { class: "pack-badge", text: "使用中" })
        : elem("button", {
            type: "button",
            class: "tile-btn",
            text: "启用",
            onclick: () => enable(undefined),
          }),
    );
  };

  const packRow = (pack: PondPack): HTMLElement => {
    const active = ctx.persister.packId === pack.id;
    const del = confirmButton("删除", () => {
      void removePack(pack).then(() => {
        ctx.toast(`已删除「${pack.name}」`);
        if (active) enable(undefined);
        else void paint();
      });
    });
    return elem(
      "div",
      { class: `pack-row${active ? " active" : ""}` },
      elem(
        "div",
        { class: "pack-info" },
        elem("span", { text: pack.name }),
        elem("small", { text: `${pack.style} · ${seasonSummary(pack)}` }),
      ),
      elem(
        "div",
        { class: "fish-actions" },
        active
          ? elem("span", { class: "pack-badge", text: "使用中" })
          : elem("button", {
              type: "button",
              class: "tile-btn",
              text: "启用",
              onclick: () => enable(pack.id),
            }),
        del,
      ),
    );
  };

  const paint = async (): Promise<void> => {
    const packs = await listPacks();
    list.replaceChildren(defaultRow(), ...packs.map(packRow));
  };

  content.replaceChildren(
    elem("p", { class: "panel-summary", text: "选择池塘底图 · 启用后重载生效" }),
    list,
    importForm(ctx, () => void paint(), enable),
  );
  void paint();
}

function importForm(
  ctx: PanelCtx,
  onImported: () => void,
  enable: (id: string | undefined) => void,
): HTMLElement {
  const json = elem("textarea", {
    class: "pack-json",
    rows: 4,
    placeholder: "粘贴池塘包 JSON，或选择 .json 文件",
    "aria-label": "池塘包 JSON",
  });
  const seasonBox = elem("div", { class: "pack-seasons" });
  const skinBox = elem("div", { class: "pack-skins" });
  const actions = elem("div", { class: "form-actions" });
  const enableBox = toggle(true, "导入后立即启用", () => {});
  const seasonInputs = new Map<Season, HTMLInputElement>();
  const skinInputs = new Map<SkinSpecies, HTMLInputElement>();
  let parsed: PondPack | null = null;

  function submit(): void {
    if (!parsed) return;
    const files: Partial<Record<Season, Blob>> = {};
    for (const [season, input] of seasonInputs) {
      const f = input.files?.[0];
      if (f) files[season] = f;
    }
    const skins: Partial<Record<SkinSpecies, Blob>> = {};
    for (const [species, input] of skinInputs) {
      const f = input.files?.[0];
      if (f) skins[species] = f;
    }
    void importPack(parsed, files, skins)
      .then((bound) => {
        ctx.toast(`已导入「${bound.name}」`);
        onImported();
        if (enableBox.checked) enable(bound.id);
      })
      .catch(() => ctx.toast("请至少为一个季节选择底图"));
  }

  function parse(): void {
    seasonBox.replaceChildren();
    skinBox.replaceChildren();
    actions.replaceChildren();
    seasonInputs.clear();
    skinInputs.clear();
    parsed = null;
    let raw: unknown;
    try {
      raw = JSON.parse(json.value);
    } catch {
      ctx.toast("JSON 解析失败，请检查内容");
      return;
    }
    const pack = parsePack(raw);
    if (!pack) {
      ctx.toast("不是有效的池塘包（检查 format / water / seasons）");
      return;
    }
    parsed = pack;
    for (const season of Object.keys(pack.seasons) as Season[]) {
      const input = elem("input", {
        type: "file",
        accept: "image/*",
        "aria-label": `${SEASON_LABELS[season]}季底图`,
      });
      seasonInputs.set(season, input);
      seasonBox.append(controlRow(`${SEASON_LABELS[season]}季底图`, "选择该季节的图片", input));
    }
    for (const species of ["koi", "silvercarp"] as SkinSpecies[]) {
      const input = elem("input", {
        type: "file",
        accept: "image/*",
        "aria-label": SPECIES_LABELS[species],
      });
      skinInputs.set(species, input);
      skinBox.append(controlRow(SPECIES_LABELS[species], "可选 · 透明底、鼻朝右的鱼贴图", input));
    }
    actions.append(
      controlRow("立即启用", "导入后重载并应用", enableBox),
      elem(
        "div",
        { class: "form-actions" },
        elem("button", { type: "button", text: "导入", onclick: submit }),
      ),
    );
    ctx.toast(`已解析「${pack.name}」· ${seasonSummary(pack)}`);
  }

  const fileInput = elem("input", {
    type: "file",
    accept: ".json,application/json",
    "aria-label": "选择 JSON 文件",
    onchange: (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) void f.text().then((t) => (json.value = t));
    },
  });

  return elem(
    "div",
    { class: "pack-import" },
    elem("p", { class: "panel-summary", text: "导入池塘包" }),
    json,
    elem(
      "div",
      { class: "form-actions" },
      fileInput,
      elem("button", { type: "button", class: "secondary", text: "解析", onclick: parse }),
    ),
    promptBlock(
      "复制底图提示词",
      "底图提示词全文（剪贴板不可用时手动复制）",
      PACK_PROMPT,
      ctx.toast,
    ),
    promptBlock(
      "复制鱼皮肤提示词",
      "鱼皮肤提示词全文（剪贴板不可用时手动复制）",
      SKIN_PROMPT,
      ctx.toast,
    ),
    seasonBox,
    skinBox,
    actions,
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

  const release = confirmButton("放生", () => {
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
