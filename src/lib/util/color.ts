export function rgbToHex(r: number, g: number, b: number): number {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (to(r) << 16) | (to(g) << 8) | to(b);
}
