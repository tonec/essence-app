import { FOCUS_ENTER_SCALE, FOCUS_EXIT_SCALE, FOCUS_MAX_STARS } from "./constants";
import type { ProjectedStar } from "./types";

// Decide which stars get a close-up: at deep zoom, every star whose disc is
// inside the viewport, largest first, capped at FOCUS_MAX_STARS. Between the
// exit and enter scales only already-focused stars are kept, so zooming back
// and forth across the threshold doesn't toggle them.
export function pickFocusedStars(
  projected: readonly ProjectedStar[],
  screen: { width: number; height: number },
  scale: number,
  prevIds: ReadonlySet<number>
): ProjectedStar[] {
  if (scale < FOCUS_EXIT_SCALE) return [];
  const entering = scale >= FOCUS_ENTER_SCALE;

  const focused: ProjectedStar[] = [];
  for (const ps of projected) {
    if (!entering && !prevIds.has(ps.id)) continue;
    // `projected` includes halo slack past the edges; require the disc itself
    // to overlap the viewport.
    if (
      ps.x + ps.r < 0 ||
      ps.y + ps.r < 0 ||
      ps.x - ps.r > screen.width ||
      ps.y - ps.r > screen.height
    ) {
      continue;
    }
    focused.push(ps);
  }

  focused.sort((a, b) => b.r - a.r);
  if (focused.length > FOCUS_MAX_STARS) focused.length = FOCUS_MAX_STARS;
  return focused;
}
