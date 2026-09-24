import type { CatalogStar } from "@/services/galaxy/types";

export type Star = CatalogStar & {
  ra: number;
  dec: number;
  baseScale: number;
  hitRadius: number;
};

export type ProjectedStar = {
  id: number;
  x: number;
  y: number;
  r: number;
};
