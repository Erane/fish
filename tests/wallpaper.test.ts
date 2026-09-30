import { describe, expect, it, vi } from "vite-plus/test";

import { applyWallpaperInput } from "../src/ui/wallpaper.ts";

class FakePointerEvent {
  type: string;
  clientX: number;
  clientY: number;
  button: number;
  constructor(type: string, init: { clientX: number; clientY: number; button: number }) {
    this.type = type;
    this.clientX = init.clientX;
    this.clientY = init.clientY;
    this.button = init.button;
  }
}

interface DispatchResult {
  events: FakePointerEvent[];
  elementFromPoint: ReturnType<typeof vi.fn>;
}

function dispatch(input: unknown, hit: boolean): DispatchResult {
  const events: FakePointerEvent[] = [];
  const element = { dispatchEvent: (e: FakePointerEvent) => events.push(e) };
  const doc = {
    elementFromPoint: vi.fn(() => (hit ? element : null)),
  };
  const g = globalThis as Record<string, unknown>;
  const savedDoc = g.document;
  const savedPointer = g.PointerEvent;
  g.document = doc;
  g.PointerEvent = FakePointerEvent;
  try {
    applyWallpaperInput(input, doc as unknown as Document);
  } finally {
    g.document = savedDoc;
    g.PointerEvent = savedPointer;
  }
  return { events, elementFromPoint: doc.elementFromPoint };
}

describe("applyWallpaperInput", () => {
  it("在命中的元素上派发 pointerdown", () => {
    const { events, elementFromPoint } = dispatch({ x: 120, y: 88 }, true);
    expect(elementFromPoint).toHaveBeenCalledWith(120, 88);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("pointerdown");
    expect(events[0]!.clientX).toBe(120);
    expect(events[0]!.clientY).toBe(88);
    expect(events[0]!.button).toBe(0);
  });

  it("坐标缺失时不派发", () => {
    const { events } = dispatch({ x: 10 }, true);
    expect(events).toHaveLength(0);
  });

  it("无命中元素时静默", () => {
    const { events } = dispatch({ x: 5, y: 5 }, false);
    expect(events).toHaveLength(0);
  });
});
