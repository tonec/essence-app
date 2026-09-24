import type { Camera } from "@/lib/galaxy/projection";
import {
  clampDec,
  clampScale,
  normalizeRa,
  panBy,
  zoomToCursor,
} from "./camera";
import {
  DRAG_THRESHOLD_PX,
  KEYBOARD_PAN_SHIFT_MULTIPLIER,
  KEYBOARD_PAN_STEP_PX,
  WHEEL_ZOOM_FACTOR,
} from "./constants";

export type MapInputOptions = {
  canvas: HTMLCanvasElement;
  camera: Camera;
  onChange: () => void;
  onPickAt: (px: number, py: number) => void;
  getScreen: () => { width: number; height: number };
};

// Attach pointer drag, wheel zoom, and arrow-key pan handlers. Mutates the
// supplied `camera` in place and calls `onChange` after each change.
// Returns a detach function.
export function attachMapInput(opts: MapInputOptions): () => void {
  const { canvas, camera, onChange, onPickAt, getScreen } = opts;

  canvas.style.cursor = "grab";

  let dragging = false;
  let didDrag = false;
  let dragStart: {
    clientX: number;
    clientY: number;
    ra0: number;
    dec0: number;
  } | null = null;

  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    didDrag = false;
    dragStart = {
      clientX: e.clientX,
      clientY: e.clientY,
      ra0: camera.ra0,
      dec0: camera.dec0,
    };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging || !dragStart) return;
    const dx = e.clientX - dragStart.clientX;
    const dy = e.clientY - dragStart.clientY;
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX) didDrag = true;
    const cosDec = Math.max(0.1, Math.cos(dragStart.dec0));
    camera.ra0 = normalizeRa(dragStart.ra0 - dx / camera.scale / cosDec);
    camera.dec0 = clampDec(dragStart.dec0 + dy / camera.scale);
    onChange();
  };

  const onPointerUp = (e: PointerEvent) => {
    dragging = false;
    canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = "grab";
    if (didDrag) return;
    const rect = canvas.getBoundingClientRect();
    onPickAt(e.clientX - rect.left, e.clientY - rect.top);
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const s1 = camera.scale;
    const s2 = clampScale(s1 * Math.pow(WHEEL_ZOOM_FACTOR, -e.deltaY));
    if (s2 === s1) return;
    const rect = canvas.getBoundingClientRect();
    const screen = getScreen();
    const uCursor = e.clientX - rect.left - screen.width / 2;
    const vCursor = screen.height / 2 - (e.clientY - rect.top);
    zoomToCursor(camera, uCursor, vCursor, s2);
    onChange();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // Ignore keys typed into inputs / editable elements.
    const target = e.target as HTMLElement | null;
    if (target && isTextInput(target)) return;

    let dx = 0;
    let dy = 0;
    switch (e.key) {
      case "ArrowLeft":
        dx = -KEYBOARD_PAN_STEP_PX;
        break;
      case "ArrowRight":
        dx = KEYBOARD_PAN_STEP_PX;
        break;
      case "ArrowUp":
        dy = -KEYBOARD_PAN_STEP_PX;
        break;
      case "ArrowDown":
        dy = KEYBOARD_PAN_STEP_PX;
        break;
      default:
        return;
    }
    e.preventDefault();
    const mult = e.shiftKey ? KEYBOARD_PAN_SHIFT_MULTIPLIER : 1;
    panBy(camera, dx * mult, dy * mult);
    onChange();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKeyDown);
  };
}

function isTextInput(el: HTMLElement): boolean {
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}
