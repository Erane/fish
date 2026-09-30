import { describe, expect, it } from "vite-plus/test";
import {
  prunePackBindings,
  pruneSkinBindings,
  resolveSkinBinding,
  withSkinBinding,
} from "../src/core/skins.ts";
import type { SkinBindings } from "../src/core/skins.ts";

const B: SkinBindings = {
  "pond-a": {
    default: { koi: "skin-1" },
    autumn: { koi: "skin-2", silvercarp: "skin-3" },
  },
  "pond-b": { summer: { silvercarp: "skin-3" } },
};

describe("resolveSkinBinding", () => {
  it("季节档位优先于包默认档", () => {
    expect(resolveSkinBinding(B, "pond-a", "autumn", "koi")).toBe("skin-2");
  });

  it("季节未指定时回退到包默认档", () => {
    expect(resolveSkinBinding(B, "pond-a", "spring", "koi")).toBe("skin-1");
  });

  it("两级都未指定则回退程序化（undefined）", () => {
    expect(resolveSkinBinding(B, "pond-a", "spring", "silvercarp")).toBeUndefined();
    expect(resolveSkinBinding(B, "pond-c", "autumn", "koi")).toBeUndefined();
    expect(resolveSkinBinding(undefined, "pond-a", "autumn", "koi")).toBeUndefined();
    expect(resolveSkinBinding(B, undefined, "autumn", "koi")).toBeUndefined();
  });

  it("物种之间互不串档", () => {
    expect(resolveSkinBinding(B, "pond-a", "autumn", "silvercarp")).toBe("skin-3");
  });
});

describe("withSkinBinding", () => {
  it("可从空绑定建链设置季档位", () => {
    expect(withSkinBinding(undefined, "p", "winter", "koi", "s1")).toEqual({
      p: { winter: { koi: "s1" } },
    });
  });

  it("覆盖同档位同物种，不影响其他物种与档位", () => {
    const out = withSkinBinding(B, "pond-a", "autumn", "koi", "skin-9")!;
    expect(out["pond-a"]!.autumn).toEqual({ koi: "skin-9", silvercarp: "skin-3" });
    expect(out["pond-a"]!.default).toEqual({ koi: "skin-1" });
  });

  it("清除后逐级回收空槽位、空档位与空包", () => {
    const step1 = withSkinBinding(B, "pond-a", "default", "koi", undefined)!;
    expect(step1).toEqual({
      "pond-a": { autumn: { koi: "skin-2", silvercarp: "skin-3" } },
      "pond-b": { summer: { silvercarp: "skin-3" } },
    });
    const step2 = withSkinBinding(step1, "pond-a", "autumn", "koi", undefined)!;
    expect(step2).toEqual({
      "pond-a": { autumn: { silvercarp: "skin-3" } },
      "pond-b": { summer: { silvercarp: "skin-3" } },
    });
    const step3 = withSkinBinding(step2, "pond-a", "autumn", "silvercarp", undefined)!;
    expect(step3).toEqual({ "pond-b": { summer: { silvercarp: "skin-3" } } });
    expect(withSkinBinding(step3, "pond-b", "summer", "silvercarp", undefined)).toBeUndefined();
  });

  it("不改动传入的绑定对象", () => {
    const snapshot = structuredClone(B);
    withSkinBinding(B, "pond-a", "autumn", "koi", "skin-9");
    withSkinBinding(B, "pond-a", "default", "koi", undefined);
    expect(B).toEqual(snapshot);
  });
});

describe("pruneSkinBindings", () => {
  it("跨包跨档位剪除某皮肤的全部引用", () => {
    expect(pruneSkinBindings(B, "skin-3")).toEqual({
      "pond-a": { default: { koi: "skin-1" }, autumn: { koi: "skin-2" } },
    });
  });

  it("无引用时内容保持不变，全空归 undefined", () => {
    expect(pruneSkinBindings(B, "skin-404")).toEqual(B);
    const only: SkinBindings = { p: { default: { koi: "skin-1" } } };
    expect(pruneSkinBindings(only, "skin-1")).toBeUndefined();
    expect(pruneSkinBindings(undefined, "skin-1")).toBeUndefined();
  });
});

describe("prunePackBindings", () => {
  it("删除指定包的绑定，其余保留", () => {
    expect(prunePackBindings(B, "pond-a")).toEqual({ "pond-b": B["pond-b"] });
  });

  it("删空则归 undefined，删除不存在的包内容不变", () => {
    const only: SkinBindings = { p: { default: { koi: "s" } } };
    expect(prunePackBindings(only, "p")).toBeUndefined();
    expect(prunePackBindings(B, "pond-z")).toEqual(B);
  });
});
