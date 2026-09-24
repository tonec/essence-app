// Gnomonic sky-view projection per SPEC.md §6.5.

export type RaDec = { ra: number; dec: number };

export function xyzToRaDec(x: number, y: number, z: number): RaDec {
  const r = Math.hypot(x, y, z);
  return {
    dec: Math.asin(z / r),
    ra: Math.atan2(y, x),
  };
}

export type Camera = {
  ra0: number;
  dec0: number;
  scale: number;
};

export type Projected = {
  u: number;
  v: number;
  visible: boolean;
};

export function projectGnomonic(star: RaDec, cam: Camera): Projected {
  const cosC =
    Math.sin(cam.dec0) * Math.sin(star.dec) +
    Math.cos(cam.dec0) * Math.cos(star.dec) * Math.cos(star.ra - cam.ra0);

  if (cosC <= 0) return { u: 0, v: 0, visible: false };

  const u = (cam.scale * Math.cos(star.dec) * Math.sin(star.ra - cam.ra0)) / cosC;
  const v =
    (cam.scale *
      (Math.cos(cam.dec0) * Math.sin(star.dec) -
        Math.sin(cam.dec0) * Math.cos(star.dec) * Math.cos(star.ra - cam.ra0))) /
    cosC;

  return { u, v, visible: true };
}
