import type {
  Application,
  Graphics as GraphicsType,
  Sprite as SpriteType,
  Texture,
} from "pixi.js";
import { projectGnomonic, type Camera } from "@/services/galaxy/projection";
import type { ClaimedStar } from "@/services/galaxy/types";
import { rgbToHex } from "@/utils/color";
import {
  CLAIMED_RING_OFFSET_PX,
  GLOW_TEXTURE_RADIUS,
  INITIAL_SCALE,
  PRIME_STAR_COLOR,
  SELECTION_RING_COLOR,
  SELECTION_RING_OFFSET_PX,
  STANDARD_STAR_COLOR,
} from "./constants";
import { DysonSwarm } from "./dyson-swarm";
import { pickFocusedStars } from "./focus";
import { FocusLayer, type FocusFactories } from "./focus-layer";
import { createGlowTexture, glowResolutionFor } from "./glow-texture";
import type { ProjectedStar, Star } from "./types";

type PixiFactories = FocusFactories & {
  Graphics: new () => GraphicsType;
  Sprite: new (texture: Texture) => SpriteType;
};

export class StarRenderer {
  readonly projected: ProjectedStar[] = [];

  private readonly app: Application;
  private readonly stars: readonly Star[];
  private readonly sprites: SpriteType[];
  private readonly ringGfx: GraphicsType;
  private readonly selectionGfx: GraphicsType;
  private readonly focusLayer: FocusLayer;
  private readonly swarm: DysonSwarm;
  private readonly indexById: Map<number, number>;
  private readonly focusedIdSet = new Set<number>();
  // This frame's projections of stars held by the focus layer.
  private readonly focusDisplayed = new Map<number, ProjectedStar>();
  // Sprite indices currently crossfaded under the focus layer.
  private readonly fadedIdxs = new Set<number>();
  private readonly makeGraphics: () => GraphicsType;
  private glowTexture: Texture;
  private glowResolution: number;

  constructor(app: Application, stars: readonly Star[], factories: PixiFactories) {
    this.app = app;
    this.stars = stars;
    this.makeGraphics = () => new factories.Graphics();
    this.glowResolution = glowResolutionFor(INITIAL_SCALE, app.renderer.resolution);
    this.glowTexture = createGlowTexture(app.renderer, this.makeGraphics, this.glowResolution);

    const layer = new factories.Container();
    app.stage.addChild(layer);

    const starLayer = new factories.Container();
    starLayer.eventMode = "none";
    this.ringGfx = new factories.Graphics();
    this.selectionGfx = new factories.Graphics();
    this.focusLayer = new FocusLayer(app, factories, () => this.applyFocusAlpha());
    this.swarm = new DysonSwarm(app, this.makeGraphics, (id) => this.focusLayer.fadeOf(id));
    layer.addChild(
      starLayer,
      this.swarm.backGfx,
      this.focusLayer.container,
      this.swarm.frontGfx,
      this.ringGfx,
      this.selectionGfx
    );

    this.indexById = new Map(stars.map((s, idx) => [s.i, idx]));

    this.sprites = new Array(stars.length);
    for (let idx = 0; idx < stars.length; idx++) {
      const s = stars[idx];
      const sprite = new factories.Sprite(this.glowTexture);
      sprite.anchor.set(0.5);
      sprite.tint = rgbToHex(s.K.r, s.K.g, s.K.b);
      sprite.visible = false;
      starLayer.addChild(sprite);
      this.sprites[idx] = sprite;
    }
  }

  // Stars currently given a close-up (deep zoom, on screen).
  get focusedIds(): ReadonlySet<number> {
    return this.focusedIdSet;
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
  }

  redraw(
    camera: Camera,
    claimedById: ReadonlyMap<number, ClaimedStar>,
    selectedId: number | null
  ): void {
    this.updateGlowResolution(camera.scale);

    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const cx = w / 2;
    const cy = h / 2;
    // Sublinear zoom-to-size so stars grow when you zoom in but don't
    // dominate the screen at max zoom.
    const zoomSizeFactor = Math.sqrt(camera.scale / INITIAL_SCALE);
    const haloExtra = GLOW_TEXTURE_RADIUS * zoomSizeFactor;

    this.ringGfx.clear();
    this.selectionGfx.clear();
    this.projected.length = 0;
    this.focusDisplayed.clear();

    for (let idx = 0; idx < this.stars.length; idx++) {
      const s = this.stars[idx];
      const sprite = this.sprites[idx];
      const p = projectGnomonic({ ra: s.ra, dec: s.dec }, camera);
      if (!p.visible) {
        sprite.visible = false;
        continue;
      }
      const sx = cx + p.u;
      const sy = cy - p.v;
      const r = s.hitRadius * zoomSizeFactor;
      const halo = r + haloExtra;
      if (sx < -halo || sy < -halo || sx > w + halo || sy > h + halo) {
        sprite.visible = false;
        continue;
      }

      const claimed = claimedById.get(s.i);
      const tint = claimed
        ? claimed.tier === "PRIME"
          ? PRIME_STAR_COLOR
          : STANDARD_STAR_COLOR
        : rgbToHex(s.K.r, s.K.g, s.K.b);

      sprite.visible = true;
      sprite.x = sx;
      sprite.y = sy;
      sprite.tint = tint;
      sprite.scale.set(s.baseScale * zoomSizeFactor);

      if (claimed) {
        this.ringGfx
          .circle(sx, sy, r + CLAIMED_RING_OFFSET_PX)
          .stroke({ color: tint, width: 1, alpha: 0.6 });
      }

      // In close-up the Dyson swarm marks the selection instead of the ring.
      if (selectedId === s.i && !this.focusLayer.has(s.i)) {
        this.selectionGfx
          .circle(sx, sy, r + SELECTION_RING_OFFSET_PX)
          .stroke({ color: SELECTION_RING_COLOR, width: 1, alpha: 0.5 });
      }

      const projected = { id: s.i, x: sx, y: sy, r };
      this.projected.push(projected);
      if (this.focusLayer.has(s.i)) this.focusDisplayed.set(s.i, projected);
    }

    this.updateFocus(camera.scale);
    this.updateSwarm(selectedId);
  }

  // Dyson swarm around the selected star while its close-up is showing.
  private updateSwarm(selectedId: number | null): void {
    const projected = selectedId === null ? undefined : this.focusDisplayed.get(selectedId);
    if (selectedId === null || !projected || !this.focusLayer.has(selectedId)) {
      this.swarm.setTarget(null);
      return;
    }
    const star = this.stars[this.indexById.get(selectedId)!];
    this.swarm.setTarget({ ...projected, color: star.K });
  }

  private updateFocus(scale: number): void {
    const focused = pickFocusedStars(this.projected, this.app.screen, scale, this.focusedIdSet);
    this.focusedIdSet.clear();
    const targets = focused.map((ps) => {
      this.focusedIdSet.add(ps.id);
      return { ...ps, color: this.stars[this.indexById.get(ps.id)!].K };
    });
    this.focusLayer.update(targets, this.focusDisplayed);
    this.applyFocusAlpha();
  }

  // Fade each close-up star's glow sprite out as its sun fades in, and
  // restore sprites whose close-up has gone.
  private applyFocusAlpha(): void {
    const held = new Set<number>();
    for (const id of this.focusLayer.ids()) {
      const idx = this.indexById.get(id);
      if (idx === undefined) continue;
      held.add(idx);
      this.sprites[idx].alpha = 1 - this.focusLayer.fadeOf(id);
    }
    for (const idx of this.fadedIdxs) {
      if (!held.has(idx)) this.sprites[idx].alpha = 1;
    }
    this.fadedIdxs.clear();
    for (const idx of held) this.fadedIdxs.add(idx);
  }

  // Re-bake the glow texture when zoom crosses a resolution threshold so
  // stars stay sharp at deep zoom without re-rendering it every frame.
  private updateGlowResolution(scale: number): void {
    const resolution = glowResolutionFor(scale, this.app.renderer.resolution);
    if (resolution === this.glowResolution) return;

    const previous = this.glowTexture;
    this.glowTexture = createGlowTexture(this.app.renderer, this.makeGraphics, resolution);
    this.glowResolution = resolution;
    for (const sprite of this.sprites) sprite.texture = this.glowTexture;
    previous.destroy(true);
  }

  destroy(): void {
    this.swarm.destroy();
    this.focusLayer.destroy();
    this.app.destroy(true, { children: true });
    this.glowTexture.destroy(true);
  }
}
