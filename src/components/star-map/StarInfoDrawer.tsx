import type { Star } from "@/services/galaxy/star-map/types";
import type { ClaimedStar } from "@/services/galaxy/types";

type Props = {
  star: Star;
  claimed: ClaimedStar | undefined;
};

const RAD_TO_DEG = 180 / Math.PI;

export function StarInfoDrawer({ star, claimed }: Props) {
  const displayName = claimed?.star_name ?? star.n ?? `BSC5P ${star.i}`;

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 max-w-xs rounded-md border border-white/10 bg-black/70 p-3 text-sm text-white shadow-lg backdrop-blur">
      <div className="font-medium">{displayName}</div>
      <div className="mt-1 text-xs text-white/60">Catalog ID {star.i}</div>
      <div className="text-xs text-white/60">
        RA {(star.ra * RAD_TO_DEG).toFixed(2)}°, Dec{" "}
        {(star.dec * RAD_TO_DEG).toFixed(2)}°
      </div>
      {typeof star.b === "number" && (
        <div className="text-xs text-white/60">
          Apparent mag {star.b.toFixed(2)}
        </div>
      )}
      {claimed && (
        <div className="mt-2 inline-flex items-center rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          {claimed.tier}
        </div>
      )}
    </div>
  );
}
