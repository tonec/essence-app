import {
  HIT_TEST_EXTRA_PX,
  HIT_TEST_MIN_RADIUS_PX,
} from "./constants";
import type { ProjectedStar } from "./types";

// Return the nearest projected star id within its (radius + slop) of (x, y),
// or null if nothing is close enough.
export function pickStarAt(
  projected: readonly ProjectedStar[],
  x: number,
  y: number,
): number | null {
  let nearestId: number | null = null;
  let nearestDist = Infinity;
  for (const ps of projected) {
    const d = Math.hypot(ps.x - x, ps.y - y);
    const threshold = Math.max(HIT_TEST_MIN_RADIUS_PX, ps.r + HIT_TEST_EXTRA_PX);
    if (d <= threshold && d < nearestDist) {
      nearestId = ps.id;
      nearestDist = d;
    }
  }
  return nearestId;
}
