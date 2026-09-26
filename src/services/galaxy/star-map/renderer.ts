import type {
  Application,
  Container as ContainerType,
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
import { createGlowTexture, glowResolutionFor } from "./glow-texture";
import type { ProjectedStar, Star } from "./types";

type PixiFactories = {
  Container: new () => ContainerType;
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
    layer.addChild(starLayer, this.ringGfx, this.selectionGfx);

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

      if (selectedId === s.i) {
        this.selectionGfx
          .circle(sx, sy, r + SELECTION_RING_OFFSET_PX)
          .stroke({ color: SELECTION_RING_COLOR, width: 1, alpha: 0.5 });
      }

      this.projected.push({ id: s.i, x: sx, y: sy, r });
    }
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
    this.app.destroy(true, { children: true });
    this.glowTexture.destroy(true);
  }
}
