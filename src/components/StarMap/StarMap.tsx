"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Camera } from "@/services/galaxy/projection";
import { animateCamera } from "@/services/galaxy/star-map/camera";
import { BACKGROUND_COLOR, INITIAL_SCALE } from "@/services/galaxy/star-map/constants";
import { loadCatalog, loadClaimedStars, prepareStars } from "@/services/galaxy/star-map/data";
import { createGlowTexture } from "@/services/galaxy/star-map/glow-texture";
import { pickStarAt } from "@/services/galaxy/star-map/hit-test";
import { attachMapInput } from "@/services/galaxy/star-map/input";
import { StarRenderer } from "@/services/galaxy/star-map/renderer";
import type { Star } from "@/services/galaxy/star-map/types";
import type { ClaimedStar } from "@/services/galaxy/types";
import { LoadingOverlay } from "../LoadingOverlay";
import { ResetViewButton } from "../ResetViewButton";
import { StarInfoDrawer } from "../StarInfoDrawer";

export function StarMap() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const [selected, setSelected] = useState<Star | null>(null);
  const [claimedById, setClaimedById] = useState<ReadonlyMap<number, ClaimedStar>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const [pixi, catalog, claimed] = await Promise.all([
        import("pixi.js"),
        loadCatalog(),
        loadClaimedStars(),
      ]);
      if (cancelled) return;

      const { Application, Container, Graphics, Sprite } = pixi;
      const { stars, starsById } = prepareStars(catalog);
      const claimedMap = new Map(claimed.map((s) => [s.id, s]));
      setClaimedById(claimedMap);

      const app = new Application();
      await app.init({
        background: BACKGROUND_COLOR,
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

      const glowTexture = createGlowTexture(app.renderer, () => new Graphics());
      const renderer = new StarRenderer(app, stars, glowTexture, {
        Container,
        Graphics,
        Sprite,
      });

      const camera: Camera = { ra0: 0, dec0: 0, scale: INITIAL_SCALE };
      let selectedId: number | null = null;
      let cancelAnimation: (() => void) | null = null;

      const redraw = () => renderer.redraw(camera, claimedMap, selectedId);

      const setSelectedStar = (star: Star | null) => {
        selectedId = star?.i ?? null;
        setSelected(star);
      };

      resetViewRef.current = () => {
        cancelAnimation?.();
        cancelAnimation = animateCamera(camera, { ra: 0, dec: 0, scale: INITIAL_SCALE }, redraw);
      };

      redraw();

      const detachInput = attachMapInput({
        canvas: app.canvas,
        camera,
        onChange: redraw,
        onPickAt: (px, py) => {
          const id = pickStarAt(renderer.projected, px, py);
          setSelectedStar(id !== null ? (starsById.get(id) ?? null) : null);
          redraw();
        },
        getScreen: () => ({
          width: app.screen.width,
          height: app.screen.height,
        }),
      });

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            renderer.resize(width, height);
            redraw();
          }
        }
      });
      resizeObserver.observe(host);

      setLoading(false);

      cleanup = () => {
        detachInput();
        resizeObserver.disconnect();
        cancelAnimation?.();
        resetViewRef.current = null;
        renderer.destroy();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  const handleResetView = useCallback(() => {
    resetViewRef.current?.();
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="absolute inset-0" />
      {loading && <LoadingOverlay />}
      <ResetViewButton onClick={handleResetView} disabled={loading} />
      {selected && <StarInfoDrawer star={selected} claimed={claimedById.get(selected.i)} />}
    </div>
  );
}
