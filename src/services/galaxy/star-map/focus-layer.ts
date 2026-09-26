import type {
  Application,
  Container as ContainerType,
  Mesh as MeshType,
  MeshGeometry as MeshGeometryType,
  Shader as ShaderType,
  Ticker,
} from "pixi.js";
import { FOCUS_CORE_FRAC, FOCUS_CORONA_SCALE, FOCUS_FADE_MS } from "./constants";
import {
  createSunShader,
  SUN_QUAD_INDICES,
  SUN_QUAD_POSITIONS,
  SUN_QUAD_UVS,
  type SunUniforms,
} from "./sun-shader";
import type { ProjectedStar } from "./types";

export type FocusFactories = {
  Container: new () => ContainerType;
  Mesh: typeof MeshType;
  MeshGeometry: typeof MeshGeometryType;
  Shader: typeof ShaderType;
};

export type FocusTarget = ProjectedStar & { color: { r: number; g: number; b: number } };

// One star's close-up: a sun-shader quad with its own uniforms and fade.
type FocusedStar = {
  mesh: MeshType<MeshGeometryType, ShaderType>;
  uniforms: SunUniforms;
  fadeTarget: number;
};

// Spread per-star animation phase so neighbouring suns don't pulse in sync.
const timeOffsetFor = (id: number) => ((id * 2654435761) % 1000) / 10;

// Animated close-ups for the focused stars. Each fades in over its glow
// sprite, runs the sun shader while shown, and fades out independently when
// it's no longer focused. Meshes are pooled so shaders aren't rebuilt as
// stars come and go. `onFrame` fires every animated frame so the owner can
// crossfade the underlying sprites by `fadeOf(id)`.
export class FocusLayer {
  readonly container: ContainerType;

  private readonly app: Application;
  private readonly factories: FocusFactories;
  private readonly reducedMotion: boolean;
  private readonly onFrame: () => void;
  private readonly active = new Map<number, FocusedStar>();
  private readonly pool: FocusedStar[] = [];
  private ticking = false;

  constructor(app: Application, factories: FocusFactories, onFrame: () => void) {
    this.app = app;
    this.factories = factories;
    this.onFrame = onFrame;
    this.reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.container = new factories.Container();
    this.container.eventMode = "none";
  }

  // Stars currently drawn by the layer (including ones fading out).
  ids(): IterableIterator<number> {
    return this.active.keys();
  }

  has(id: number): boolean {
    return this.active.has(id);
  }

  fadeOf(id: number): number {
    return this.active.get(id)?.uniforms.uFade ?? 0;
  }

  // `focused` is what should have a close-up now; `displayed` is this frame's
  // projection of every star the layer holds (missing = left the screen).
  update(focused: readonly FocusTarget[], displayed: ReadonlyMap<number, ProjectedStar>): void {
    for (const [id, entry] of this.active) {
      const ps = displayed.get(id);
      if (!ps) {
        this.release(id, entry);
        continue;
      }
      this.place(entry, ps);
      entry.fadeTarget = 0;
    }

    for (const target of focused) {
      const entry = this.active.get(target.id) ?? this.acquire(target);
      entry.fadeTarget = 1;
    }

    this.syncTicker();
  }

  destroy(): void {
    this.app.ticker.remove(this.tick, this);
    for (const entry of this.active.values()) entry.mesh.destroy();
    for (const entry of this.pool) entry.mesh.destroy();
    this.active.clear();
    this.pool.length = 0;
    this.container.destroy();
  }

  private acquire(target: FocusTarget): FocusedStar {
    const entry = this.pool.pop() ?? this.create();
    entry.uniforms.uFade = 0;
    entry.uniforms.uTime = timeOffsetFor(target.id);
    entry.uniforms.uColor[0] = target.color.r;
    entry.uniforms.uColor[1] = target.color.g;
    entry.uniforms.uColor[2] = target.color.b;
    entry.mesh.visible = true;
    this.place(entry, target);
    this.active.set(target.id, entry);
    return entry;
  }

  private release(id: number, entry: FocusedStar): void {
    entry.mesh.visible = false;
    entry.uniforms.uFade = 0;
    this.active.delete(id);
    this.pool.push(entry);
  }

  private create(): FocusedStar {
    const { Mesh, MeshGeometry, Shader } = this.factories;
    const { shader, uniforms } = createSunShader(Shader, FOCUS_CORE_FRAC);
    const geometry = new MeshGeometry({
      positions: SUN_QUAD_POSITIONS,
      uvs: SUN_QUAD_UVS,
      indices: SUN_QUAD_INDICES,
    });
    const mesh = new Mesh<MeshGeometryType, ShaderType>({ geometry, shader });
    mesh.blendMode = "add";
    this.container.addChild(mesh);
    return { mesh, uniforms, fadeTarget: 0 };
  }

  private place(entry: FocusedStar, ps: ProjectedStar): void {
    entry.mesh.position.set(ps.x, ps.y);
    entry.mesh.scale.set(ps.r * FOCUS_CORONA_SCALE);
  }

  private syncTicker(): void {
    const shouldTick = this.active.size > 0;
    if (shouldTick === this.ticking) return;
    this.ticking = shouldTick;
    if (shouldTick) this.app.ticker.add(this.tick, this);
    else this.app.ticker.remove(this.tick, this);
  }

  private tick(ticker: Ticker): void {
    const dt = ticker.deltaMS;
    const step = dt / FOCUS_FADE_MS;

    for (const [id, entry] of this.active) {
      const u = entry.uniforms;
      if (!this.reducedMotion) u.uTime += dt / 1000;
      u.uFade =
        u.uFade < entry.fadeTarget
          ? Math.min(entry.fadeTarget, u.uFade + step)
          : Math.max(entry.fadeTarget, u.uFade - step);
      if (u.uFade === 0 && entry.fadeTarget === 0) this.release(id, entry);
    }

    this.onFrame();
    this.syncTicker();
  }
}
