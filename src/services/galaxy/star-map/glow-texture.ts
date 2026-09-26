import type { Graphics, Renderer, Texture } from "pixi.js";
import {
  GLOW_MAX_TEXTURE_PX,
  GLOW_TEXTURE_RADIUS,
  INITIAL_SCALE,
  STAR_MAX_RADIUS_PX,
} from "./constants";

const MIN_GLOW_RESOLUTION = 2;

// Build a shared white radial-glow texture: bright core wrapped in progressively
// softer halos. Sprites tint this texture to each star's colour so the palette
// shows through the glow. `resolution` only changes pixel density — the texture's
// logical size stays at GLOW_TEXTURE_RADIUS, so sprite scales are unaffected.
export function createGlowTexture(
  renderer: Renderer,
  makeGraphics: () => Graphics,
  resolution: number
): Texture {
  const gfx = makeGraphics()
    .circle(0, 0, GLOW_TEXTURE_RADIUS)
    .fill({ color: 0xffffff, alpha: 0.05 })
    .circle(0, 0, GLOW_TEXTURE_RADIUS * 0.75)
    .fill({ color: 0xffffff, alpha: 0.08 })
    .circle(0, 0, GLOW_TEXTURE_RADIUS * 0.5)
    .fill({ color: 0xffffff, alpha: 0.16 })
    .circle(0, 0, GLOW_TEXTURE_RADIUS * 0.3)
    .fill({ color: 0xffffff, alpha: 0.35 })
    .circle(0, 0, GLOW_TEXTURE_RADIUS * 0.15)
    .fill({ color: 0xffffff, alpha: 0.9 });

  const texture = renderer.generateTexture({ target: gfx, resolution });
  gfx.destroy();
  return texture;
}

// Texture resolution needed so the largest star isn't upscaled at this zoom.
// Rounded up to a power of two so the texture is only re-baked when zoom
// crosses a threshold (~every 4× in scale, since star size grows with √scale).
export function glowResolutionFor(scale: number, devicePixelRatio: number): number {
  const zoomSizeFactor = Math.sqrt(scale / INITIAL_SCALE);
  const maxRadiusPx = STAR_MAX_RADIUS_PX * zoomSizeFactor * devicePixelRatio;
  const needed = maxRadiusPx / GLOW_TEXTURE_RADIUS;
  const stepped = 2 ** Math.ceil(Math.log2(Math.max(needed, 1)));
  const maxResolution = GLOW_MAX_TEXTURE_PX / (2 * GLOW_TEXTURE_RADIUS);
  return Math.min(maxResolution, Math.max(MIN_GLOW_RESOLUTION, stepped));
}
