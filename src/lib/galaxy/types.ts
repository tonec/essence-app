export type CatalogStar = {
  i: number;
  n?: string;
  x: number;
  y: number;
  z: number;
  N: number;
  K: { r: number; g: number; b: number };
  b?: number;
  g?: string;
};

export type Tier = 'STANDARD' | 'PRIME';
export type StarStatus = 'AVAILABLE' | 'RESERVED' | 'CLAIMED';

export type ClaimedStar = {
  id: number;
  star_name: string;
  tier: Tier;
  status: StarStatus;
  user_id: string | null;
  updated_at: string;
};
