import {
  inverseGnomonic,
  projectGnomonic,
  type Camera,
} from "@/services/galaxy/projection";
import { clamp } from "@/utils/math";
import {
  CAMERA_ANIMATION_MS,
  MAX_SCALE,
  MIN_SCALE,
  ZOOM_CORRECTION_MAX_ITERATIONS,
  ZOOM_CORRECTION_TOLERANCE,
} from "./constants";

const TWO_PI = Math.PI * 2;
const DEC_LIMIT = Math.PI / 2 - 0.01;

export function normalizeRa(ra: number): number {
  return ((ra % TWO_PI) + TWO_PI) % TWO_PI;
}

export function clampDec(dec: number): number {
  return clamp(dec, -DEC_LIMIT, DEC_LIMIT);
}

export function clampScale(scale: number): number {
  return clamp(scale, MIN_SCALE, MAX_SCALE);
}

// Small-angle pan: treat dx / dy in screen pixels as camera-axis-aligned
// rotations, accounting for the RA convergence toward the poles.
export function panBy(camera: Camera, dxPx: number, dyPx: number): void {
  const cosDec = Math.max(0.1, Math.cos(camera.dec0));
  camera.ra0 = normalizeRa(camera.ra0 - dxPx / camera.scale / cosDec);
  camera.dec0 = clampDec(camera.dec0 + dyPx / camera.scale);
}

// Change scale while keeping the sky point currently under (uCursor, vCursor)
// pinned to that screen position. Runs a few Newton-style corrections using
// the same small-angle pan formula.
export function zoomToCursor(
  camera: Camera,
  uCursor: number,
  vCursor: number,
  newScale: number,
): void {
  const target = inverseGnomonic(uCursor, vCursor, camera);
  camera.scale = newScale;
  for (let i = 0; i < ZOOM_CORRECTION_MAX_ITERATIONS; i++) {
    const p = projectGnomonic(target, camera);
    if (!p.visible) break;
    const dx = p.u - uCursor;
    const dy = p.v - vCursor;
    if (
      Math.abs(dx) < ZOOM_CORRECTION_TOLERANCE &&
      Math.abs(dy) < ZOOM_CORRECTION_TOLERANCE
    ) {
      break;
    }
    const cosDec = Math.max(0.1, Math.cos(camera.dec0));
    camera.ra0 += dx / camera.scale / cosDec;
    camera.dec0 = clampDec(camera.dec0 + dy / camera.scale);
  }
  camera.ra0 = normalizeRa(camera.ra0);
}

export type CameraTarget = { ra: number; dec: number; scale: number };

// easeOutCubic (t -> 1).
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// Animate ra/dec/scale toward `target`, mutating `camera` and calling
// `onFrame` after each step. RA takes the shortest path around the 2π wrap;
// scale is lerped in log space so the visual zoom feels linear. Returns a
// cancel function.
export function animateCamera(
  camera: Camera,
  target: CameraTarget,
  onFrame: () => void,
  duration = CAMERA_ANIMATION_MS,
): () => void {
  const startRa = camera.ra0;
  const startDec = camera.dec0;
  const startScale = camera.scale;

  let dRa = target.ra - startRa;
  if (dRa > Math.PI) dRa -= TWO_PI;
  if (dRa < -Math.PI) dRa += TWO_PI;
  const dDec = target.dec - startDec;
  const logStart = Math.log(startScale);
  const logEnd = Math.log(target.scale);

  const t0 = performance.now();
  let raf = 0;
  let cancelled = false;

  const tick = () => {
    if (cancelled) return;
    const t = Math.min(1, (performance.now() - t0) / duration);
    const e = easeOut(t);
    camera.ra0 = normalizeRa(startRa + dRa * e);
    camera.dec0 = clampDec(startDec + dDec * e);
    camera.scale = Math.exp(logStart + (logEnd - logStart) * e);
    onFrame();
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    if (raf) cancelAnimationFrame(raf);
  };
}
