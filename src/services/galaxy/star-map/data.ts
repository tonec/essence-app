import { xyzToRaDec } from "@/services/galaxy/projection";
import type { CatalogStar, ClaimedStar } from "@/services/galaxy/types";
import { GLOW_TEXTURE_RADIUS } from "./constants";
import type { Star } from "./types";

const DEFAULT_APPARENT_MAG = 6;
const MIN_RADIUS = 0.5;
const MAX_RADIUS = 5;

export async function loadCatalog(): Promise<CatalogStar[]> {
  const res = await fetch("/catalog.json");
  if (!res.ok) throw new Error(`Failed to load catalog: ${res.status}`);
  return (await res.json()) as CatalogStar[];
}

// Tolerates 500s (e.g. missing tables during local dev) — the map still
// renders, just without any claimed-star highlights.
export async function loadClaimedStars(): Promise<ClaimedStar[]> {
  try {
    const res = await fetch("/api/stars");
    if (!res.ok) return [];
    const payload = (await res.json()) as { stars?: ClaimedStar[] };
    return payload.stars ?? [];
  } catch {
    return [];
  }
}

export function prepareStars(catalog: CatalogStar[]): {
  stars: Star[];
  starsById: Map<number, Star>;
} {
  const stars: Star[] = catalog.map((s) => {
    const { ra, dec } = xyzToRaDec(s.x, s.y, s.z);
    const b = typeof s.b === "number" ? s.b : DEFAULT_APPARENT_MAG;
    // Star's on-screen radius at INITIAL_SCALE, in logical pixels.
    // Bright stars (low b) get radius 5; dim ones bottom out at 0.5.
    const screenRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, 6 - b));
    return {
      ...s,
      ra,
      dec,
      baseScale: screenRadius / GLOW_TEXTURE_RADIUS,
      hitRadius: screenRadius,
    };
  });
  const starsById = new Map(stars.map((s) => [s.i, s]));
  return { stars, starsById };
}
