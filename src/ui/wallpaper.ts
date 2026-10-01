import { INTERACTIONS } from "../core/types.ts";
import type { Interaction } from "../core/types.ts";

type TauriGlobal = {
  core: { invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> };
  event: {
    listen(event: string, handler: (e: { payload: unknown }) => void): Promise<void>;
  };
  window: { getCurrentWindow(): { label: string } };
};

function tauri(): TauriGlobal {
  return (window as unknown as { __TAURI__: TauriGlobal }).__TAURI__;
}

export const inTauri = (): boolean => "__TAURI_INTERNALS__" in window;

export const isWallpaper = (): boolean =>
  inTauri() && tauri().window.getCurrentWindow().label.startsWith("wallpaper");

export function applyWallpaperInput(payload: unknown, root: Document = document): void {
  const input = payload as { x?: unknown; y?: unknown };
  if (typeof input.x !== "number" || typeof input.y !== "number") return;
  const target = root.elementFromPoint(input.x, input.y);
  target?.dispatchEvent(
    new PointerEvent("pointerdown", {
      clientX: input.x,
      clientY: input.y,
      button: 0,
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }),
  );
}

export function watchShellState(handlers: {
  onPondState: (alive: boolean) => void;
  onInteractionChanged: (mode: Interaction) => void;
  onRespawn: () => void;
}): void {
  void tauri().event.listen("pond-state", ({ payload }) => handlers.onPondState(payload === true));
  void tauri().event.listen("interaction-changed", ({ payload }) => {
    const mode = INTERACTIONS.find((m) => m === payload);
    if (mode) handlers.onInteractionChanged(mode);
  });
  void tauri().event.listen("respawn-fish", () => handlers.onRespawn());
}

export function bindWallpaperInput(): void {
  void tauri().event.listen("wallpaper-input", ({ payload }) => {
    applyWallpaperInput(payload);
  });
}

export function syncInteraction(mode: Interaction): void {
  void tauri().core.invoke("set_wallpaper_mode", { mode });
}
