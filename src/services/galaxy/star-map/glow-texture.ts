import type { Graphics, Renderer, Texture } from "pixi.js";
import { GLOW_TEXTURE_RADIUS } from "./constants";

// Build a shared white radial-glow texture: bright core wrapped in progressively
// softer halos. Sprites tint this texture to each star's colour so the palette
// shows through the glow.
export function createGlowTexture(renderer: Renderer, makeGraphics: () => Graphics): Texture {
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

  const texture = renderer.generateTexture({ target: gfx, resolution: 2 });
  gfx.destroy();
  return texture;
}
