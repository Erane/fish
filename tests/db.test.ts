import { describe, expect, it } from "vite-plus/test";
import { normalizeSeededThemes } from "../src/data/db.ts";

describe("normalizeSeededThemes", () => {
  it("保留 url 与 id 齐全的记账条目", () => {
    expect(normalizeSeededThemes([{ url: "a.json", id: "a" }])).toEqual([
      { url: "a.json", id: "a" },
    ]);
  });

  it("旧版纯 url 字符串与残缺条目被过滤", () => {
    expect(
      normalizeSeededThemes(["theme/autumn.json", { url: "b.json" }, { id: "c" }, null, 42]),
    ).toEqual([]);
  });

  it("非数组视为无记账", () => {
    expect(normalizeSeededThemes(undefined)).toEqual([]);
  });
});
