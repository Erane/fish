import type { Palette } from "./types.ts";

export const PALETTES: Palette[] = [
  { name: "红白", base: "#f2eee2", spot: "#df4935", fin: "#f3f0e6", kind: "kohaku" },
  {
    name: "大正三色",
    base: "#f1ede1",
    spot: "#d94b34",
    second: "#1d2526",
    fin: "#efeee4",
    kind: "sanke",
  },
  { name: "黄金", base: "#dda63b", spot: "#d99e2f", fin: "#e2b458", kind: "ogon" },
  { name: "白写", base: "#f0efe6", spot: "#1e2727", fin: "#ecebe3", kind: "utsuri" },
  { name: "丹顶", base: "#f4f1e8", spot: "#df4935", fin: "#f2f1e9", kind: "tancho" },
  { name: "墨鲤", base: "#2a3130", spot: "#161c1d", fin: "#444c49", kind: "karasu" },
  { name: "纯红", base: "#d0402c", spot: "#d0402c", fin: "#cf4130", kind: "benigoi" },
];

export const SILVER_CARP: Palette = {
  name: "青鲢",
  base: "#184140",
  spot: "#184140",
  fin: "#a9c4bd",
  kind: "silvercarp",
};

export function fishPalette(f: { palette: number; species?: "silvercarp" }): Palette {
  return f.species === "silvercarp" ? SILVER_CARP : (PALETTES[f.palette] ?? PALETTES[0]!);
}
