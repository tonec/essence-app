"use client";

import { useEffect, useRef, useState } from "react";
import {
  projectGnomonic,
  xyzToRaDec,
  type Camera,
} from "@/lib/galaxy/projection";
import type { CatalogStar, ClaimedStar } from "@/lib/galaxy/types";

type Star = CatalogStar & { ra: number; dec: number; screenRadius: number };

const INITIAL_SCALE = 400;
const MIN_SCALE = 50;
const MAX_SCALE = 20000;

export function StarMap() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<Star | null>(null);
  const [claimedById, setClaimedById] = useState<Map<number, ClaimedStar>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const [{ Application, Graphics, Container }, catalogRes, claimedRes] =
        await Promise.all([
          import("pixi.js"),
          fetch("/catalog.json"),
          fetch("/api/stars"),
        ]);

      if (cancelled) return;

      const rawCatalog = (await catalogRes.json()) as CatalogStar[];
      const claimedPayload = claimedRes.ok
        ? ((await claimedRes.json()) as { stars: ClaimedStar[] })
        : { stars: [] };
      const claimedMap = new Map(claimedPayload.stars.map((s) => [s.id, s]));
      if (!cancelled) setClaimedById(claimedMap);

      const stars: Star[] = rawCatalog.map((s) => {
        const { ra, dec } = xyzToRaDec(s.x, s.y, s.z);
        const b = typeof s.b === "number" ? s.b : 6;
        const screenRadius = Math.max(0.5, Math.min(5, 6 - b));
        return { ...s, ra, dec, screenRadius };
      });

      const host = hostRef.current;
      if (!host) return;

      const app = new Application();
      await app.init({
        background: 0x02040a,
        antialias: true,
        preference: "webgl",
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        width: host.clientWidth,
        height: host.clientHeight,
      });
      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }
      host.appendChild(app.canvas);
      app.canvas.style.cursor = "grab";

      const layer = new Container();
      app.stage.addChild(layer);

      const starGfx = new Graphics();
      const ringGfx = new Graphics();
      const selectionGfx = new Graphics();
      layer.addChild(starGfx, ringGfx, selectionGfx);

      const camera: Camera = { ra0: 0, dec0: 0, scale: INITIAL_SCALE };
      let currentSelectedId: number | null = null;
      // Snapshot of last-projected screen positions; used for hit-testing on click.
      const projectedScreen: { id: number; x: number; y: number; r: number }[] =
        [];

      const redraw = () => {
        const w = app.screen.width;
        const h = app.screen.height;
        const cx = w / 2;
        const cy = h / 2;

        starGfx.clear();
        ringGfx.clear();
        selectionGfx.clear();
        projectedScreen.length = 0;

        for (const s of stars) {
          const p = projectGnomonic({ ra: s.ra, dec: s.dec }, camera);
          if (!p.visible) continue;
          const sx = cx + p.u;
          const sy = cy - p.v;
          if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) continue;

          const claimed = claimedMap.get(s.i);
          const colour = claimed
            ? claimed.tier === "PRIME"
              ? 0xffd166
              : 0x8ecae6
            : rgbToHex(s.K.r, s.K.g, s.K.b);

          starGfx
            .circle(sx, sy, s.screenRadius)
            .fill({ color: colour, alpha: 0.95 });

          if (claimed) {
            ringGfx
              .circle(sx, sy, s.screenRadius + 4)
              .stroke({ color: colour, width: 1, alpha: 0.6 });
          }

          if (currentSelectedId === s.i) {
            selectionGfx
              .circle(sx, sy, s.screenRadius + 8)
              .stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
          }

          projectedScreen.push({ id: s.i, x: sx, y: sy, r: s.screenRadius });
        }
      };

      redraw();

      // Pan.
      let dragging = false;
      let dragStart: {
        x: number;
        y: number;
        ra0: number;
        dec0: number;
      } | null = null;
      let didDrag = false;

      const canvas = app.canvas;
      const onPointerDown = (e: PointerEvent) => {
        dragging = true;
        didDrag = false;
        dragStart = {
          x: e.clientX,
          y: e.clientY,
          ra0: camera.ra0,
          dec0: camera.dec0,
        };
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = "grabbing";
      };
      const onPointerMove = (e: PointerEvent) => {
        if (!dragging || !dragStart) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) didDrag = true;
        // Approximate inverse projection near the camera center.
        const cosDec = Math.max(0.1, Math.cos(dragStart.dec0));
        const nextRa = dragStart.ra0 - dx / camera.scale / cosDec;
        camera.ra0 = ((nextRa % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        camera.dec0 = clamp(
          dragStart.dec0 + dy / camera.scale,
          -Math.PI / 2 + 0.01,
          Math.PI / 2 - 0.01,
        );
        redraw();
      };
      const onPointerUp = (e: PointerEvent) => {
        dragging = false;
        canvas.releasePointerCapture(e.pointerId);
        canvas.style.cursor = "grab";
        if (didDrag) return;

        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        let nearest: { id: number; d: number } | null = null;
        for (const ps of projectedScreen) {
          const d = Math.hypot(ps.x - px, ps.y - py);
          const threshold = Math.max(6, ps.r + 4);
          if (d <= threshold && (!nearest || d < nearest.d)) {
            nearest = { id: ps.id, d };
          }
        }
        if (nearest) {
          const hit = stars.find((s) => s.i === nearest!.id) ?? null;
          currentSelectedId = hit?.i ?? null;
          setSelected(hit);
        } else {
          currentSelectedId = null;
          setSelected(null);
        }
        redraw();
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const factor = Math.pow(1.0015, -e.deltaY);
        camera.scale = clamp(camera.scale * factor, MIN_SCALE, MAX_SCALE);
        redraw();
      };

      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      canvas.addEventListener("wheel", onWheel, { passive: false });

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            app.renderer.resize(width, height);
            redraw();
          }
        }
      });
      resizeObserver.observe(host);

      setLoading(false);

      cleanup = () => {
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
        canvas.removeEventListener("wheel", onWheel);
        resizeObserver.disconnect();
        app.destroy(true, { children: true });
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="absolute inset-0" />
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/60">
          Loading catalog…
        </div>
      )}
      {selected && (
        <div className="pointer-events-auto absolute bottom-4 left-4 max-w-xs rounded-md border border-white/10 bg-black/70 p-3 text-sm text-white shadow-lg backdrop-blur">
          <div className="font-medium">
            {claimedById.get(selected.i)?.star_name ??
              selected.n ??
              `BSC5P ${selected.i}`}
          </div>
          <div className="mt-1 text-xs text-white/60">
            Catalog ID {selected.i}
          </div>
          <div className="text-xs text-white/60">
            RA {(selected.ra * (180 / Math.PI)).toFixed(2)}°, Dec{" "}
            {(selected.dec * (180 / Math.PI)).toFixed(2)}°
          </div>
          {typeof selected.b === "number" && (
            <div className="text-xs text-white/60">
              Apparent mag {selected.b.toFixed(2)}
            </div>
          )}
          {claimedById.get(selected.i) && (
            <div className="mt-2 inline-flex items-center rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              {claimedById.get(selected.i)!.tier}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function rgbToHex(r: number, g: number, b: number) {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (to(r) << 16) | (to(g) << 8) | to(b);
}
