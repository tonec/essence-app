import type { Tier } from "./types";

export const PRIME_MAX_MAGNITUDE = 3.0;

export function tierForBrightness(b: number | undefined): Tier {
  if (typeof b === "number" && b < PRIME_MAX_MAGNITUDE) return "PRIME";
  return "STANDARD";
}
