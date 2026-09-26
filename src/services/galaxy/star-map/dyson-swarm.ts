import type { Graphics, Ticker, Application } from "pixi.js";
import { rgbToHex } from "@/utils/color";
import {
  DYSON_ORBIT_SPEED,
  DYSON_PANEL_SIZE_FRAC,
  FOCUS_CORE_FRAC,
  FOCUS_CORONA_SCALE,
  FOCUS_FADE_MS,
} from "./constants";
import type { FocusTarget } from "./focus-layer";

type Ring = {
  radius: number; // × star on-screen radius
  inclination: number; // tilt out of the screen plane, radians
  node: number; // in-screen rotation of the tilt axis, radians
  speed: number; // radians per second
  count: number;
  phase: number;
};

// Inner rings orbit faster; alternating tilts so the swarm reads as 3D.
const RINGS: readonly Ring[] = [
  { radius: 0.62, inclination: 1.15, node: 0.3, speed: 0.5, count: 28, phase: 0 },
  // { radius: 0.82, inclination: -1.0, node: -0.5, speed: 0.33, count: 36, phase: 1.3 },
  // { radius: 1.05, inclination: 1.35, node: 1.2, speed: 0.22, count: 44, phase: 2.1 },
];

const MISSING_PANEL_FRAC = 0.15;
const ORBIT_PATH_SEGMENTS = 96;
const SUN_DISC_FRAC = FOCUS_CORE_FRAC * FOCUS_CORONA_SCALE;
const DARK_PANEL_COLOR = 0x0b0d14;

type Vec3 = { x: number; y: number; z: number };

// Deterministic 0..1 hash so the same panels are always missing.
const panelHash = (ring: number, idx: number) => {
  const n = Math.sin(ring * 127.1 + idx * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

// Rotate a ring-plane vector by the ring's inclination (about x) then node
// (about the view axis z). +z points toward the viewer.
function orient(ring: Ring, v: Vec3): Vec3 {
  const ci = Math.cos(ring.inclination);
  const si = Math.sin(ring.inclination);
  const y1 = v.y * ci - v.z * si;
  const z1 = v.y * si + v.z * ci;
  const cn = Math.cos(ring.node);
  const sn = Math.sin(ring.node);
  return { x: v.x * cn - y1 * sn, y: v.x * sn + y1 * cn, z: z1 };
}

// Orbital rings of collector panels around the selected star's close-up.
// Panels behind the star draw below the (additive) sun and are culled inside
// its disc; panels in front draw above it as dark silhouettes. Each panel
// faces the star, so the lit side is only seen on the far half of an orbit.
export class DysonSwarm {
  readonly backGfx: Graphics;
  readonly frontGfx: Graphics;

  private readonly app: Application;
  private readonly sunFadeOf: (id: number) => number;
  private readonly reducedMotion: boolean;
  private target: FocusTarget | null = null;
  private visibleTarget: FocusTarget | null = null;
  private fade = 0;
  private time = 0;
  private ticking = false;

  constructor(app: Application, makeGraphics: () => Graphics, sunFadeOf: (id: number) => number) {
    this.app = app;
    this.sunFadeOf = sunFadeOf;
    this.reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.backGfx = makeGraphics();
    this.frontGfx = makeGraphics();
    this.backGfx.eventMode = "none";
    this.frontGfx.eventMode = "none";
  }

  // Selected star while it's in close-up, or null. Called every redraw.
  setTarget(target: FocusTarget | null): void {
    if (target && this.visibleTarget && target.id !== this.visibleTarget.id) this.fade = 0;
    this.target = target;
    if (target) this.visibleTarget = target;
    this.syncTicker();
  }

  destroy(): void {
    this.app.ticker.remove(this.tick, this);
    this.backGfx.destroy();
    this.frontGfx.destroy();
  }

  private syncTicker(): void {
    const shouldTick = this.visibleTarget !== null;
    if (shouldTick === this.ticking) return;
    this.ticking = shouldTick;
    if (shouldTick) this.app.ticker.add(this.tick, this);
    else this.app.ticker.remove(this.tick, this);
  }

  private tick(ticker: Ticker): void {
    const dt = ticker.deltaMS;
    if (!this.reducedMotion) this.time += (dt / 1000) * DYSON_ORBIT_SPEED;
    const step = dt / FOCUS_FADE_MS;
    this.fade = this.target ? Math.min(1, this.fade + step) : Math.max(0, this.fade - step);

    this.backGfx.clear();
    this.frontGfx.clear();
    const shown = this.visibleTarget;
    if (!shown || this.fade === 0) {
      if (!this.target) this.visibleTarget = null;
      this.syncTicker();
      return;
    }
    const alpha = this.fade * this.sunFadeOf(shown.id);
    if (alpha > 0) this.draw(shown, alpha);
  }

  private draw(t: FocusTarget, alpha: number): void {
    const discR = t.r * SUN_DISC_FRAC;
    const litColor = rgbToHex(t.color.r * 0.6 + 0.4, t.color.g * 0.6 + 0.4, t.color.b * 0.6 + 0.4);
    const edgeColor = rgbToHex(t.color.r, t.color.g, t.color.b);
    const halfLen = t.r * DYSON_PANEL_SIZE_FRAC;
    const halfWid = halfLen * 0.6;

    RINGS.forEach((ring, ringIdx) => {
      const R = ring.radius * t.r;
      this.drawOrbitPath(ring, R, t, discR, edgeColor, alpha);

      for (let k = 0; k < ring.count; k++) {
        if (panelHash(ringIdx, k) < MISSING_PANEL_FRAC) continue;
        const theta = ring.phase + (k / ring.count) * Math.PI * 2 + this.time * ring.speed;
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        const centre = orient(ring, { x: c * R, y: s * R, z: 0 });
        const tangent = orient(ring, { x: -s, y: c, z: 0 });
        const radial = orient(ring, { x: c, y: s, z: 0 });
        const normal = orient(ring, { x: 0, y: 0, z: 1 });
        const behind = centre.z < 0;

        // Panel spans tangent × ring normal, so its face points at the star.
        const pts: number[] = [];
        for (const [a, b] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          pts.push(
            t.x + centre.x + tangent.x * a * halfLen + normal.x * b * halfWid,
            t.y + centre.y + tangent.y * a * halfLen + normal.y * b * halfWid
          );
        }

        if (behind) {
          if (Math.hypot(centre.x, centre.y) < discR) continue;
          // Star-facing (lit) side is toward the viewer on the far half.
          const facing = Math.max(0.25, -radial.z);
          this.backGfx.poly(pts).fill({ color: litColor, alpha: alpha * facing });
        } else {
          this.frontGfx
            .poly(pts)
            .fill({ color: DARK_PANEL_COLOR, alpha: alpha * 0.95 })
            .stroke({ color: edgeColor, width: 1, alpha: alpha * 0.5 });
        }
      }
    });
  }

  // Faint orbit line, split by depth like the panels.
  private drawOrbitPath(
    ring: Ring,
    R: number,
    t: FocusTarget,
    discR: number,
    color: number,
    alpha: number
  ): void {
    let prev: Vec3 | null = null;
    for (let i = 0; i <= ORBIT_PATH_SEGMENTS; i++) {
      const theta = (i / ORBIT_PATH_SEGMENTS) * Math.PI * 2;
      const p = orient(ring, { x: Math.cos(theta) * R, y: Math.sin(theta) * R, z: 0 });
      if (prev) {
        const behind = p.z < 0;
        if (!behind || Math.hypot(p.x, p.y) >= discR) {
          (behind ? this.backGfx : this.frontGfx)
            .moveTo(t.x + prev.x, t.y + prev.y)
            .lineTo(t.x + p.x, t.y + p.y)
            .stroke({ color, width: 1, alpha: alpha * 0.18 });
        }
      }
      prev = p;
    }
  }
}
