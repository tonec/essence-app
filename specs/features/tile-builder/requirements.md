# Requirements: 2D Tile Builder Engine

## Grid Constraints

Fixed $32 \times 32$ grid cells per plot (expandable to $64 \times 64$ via Mega-Plot upsell — `plots.expanded = true`).

## Editing Suite Tools

  - **Pencil / Tile Brush:** Single-tile or multi-tile placement.
  - **Eraser:** Clears tile cell back to transparent background.
  - **Eyedropper:** Samples existing tile type from canvas.
  - **Fill Bucket:** Fills contiguous identical tile regions.
  - **Undo / Redo Stack:** Minimum 20-step local history stack.
  - **Clear Plot:** Resets entire canvas to blank state (requires confirmation prompt).

## Tile Categories

  1. _Structural:_ Sci-fi hull plates, solar panels, metal beams, glass walls, brickwork.
  2. _Decorations:_ Retro furniture, alien flora, space antennas, structural pipes.
  3. _Lighting / Neon:_ Glowing neon tubes, flashing alert lights, spotlights.
  4. _Special:_ Animated thrusters, energy fields, particle emitters.

## Palette source of truth

A static TypeScript module at `src/lib/tiles/palette.ts` maps each `tile_id` (integer) to `{ sprite, category, minTier }`. `tile_data` in the database stores only integer tile IDs; sprites and tier-gating rules are resolved client- and server-side from this module. Server-side validation on `PUT /api/plots/:star_id` rejects tile IDs that exceed the plot's tier entitlement.

