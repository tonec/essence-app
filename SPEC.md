# Product Specification Document (SPEC.MD)

**Project Name:** Star-Builder (Working Title)  
**Document Version:** 1.1.0  
**Status:** Draft / Initial Specification

---

## 1. Executive Summary & Concept Overview

**Star-Builder** is a persistent, multiplayer web application that bridges the gap between sentimental online star registration, digital real-estate advertising, and creative retro sandbox gaming (such as _Terraria_ or _Starbound_).

Users explore a stylized 2D canvas star map representing a shared galaxy field. The claimable universe is the finite **BSC5P catalog (~9,101 real stars)** projected to a 2D plane (`x`, `y` in parsecs from the BSC5P `bsc5p_3d.json`; `z` is used only as a visual/parallax hint). On this map, users can purchase, name, and dedicate vacant catalog stars. Upon claiming a star, the user receives an associated $32 \times 32$ pixel construction plot anchored directly to their celestial location. Using an integrated 2D pixel-art builder engine, owners can construct custom pixel structures, sci-fi habitats, neon billboards, monuments, or creative art pieces that are permanently rendered onto the public universe map for all visitors to discover.

---

## 2. Core User Experience & Application Loop

The user interaction follows a tightly designed 4-step loop:

```
┌─────────────────────────────────────────────────────────┐
│ 1. EXPLORE & SELECT                                     │
│ Navigate galaxy map, locate vacant catalog stars, and    │
│ inspect registered star structures and dedications.      │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 2. RESERVE & PURCHASE                                   │
│ Name the star, author a 280-char dedication, lock plot   │
│ for 5 minutes, and complete checkout via Stripe.        │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 3. BUILD & CUSTOMIZE                                    │
│ Access the 2D tile editor to build a pixel structure     │
│ on the assigned 32x32 grid around the star anchor.      │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 4. PUBLISH & SHARE                                      │
│ Changes commit live to the shared galaxy map.           │
│ Share unique coordinates via direct deep-link URLs.     │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Target Audience & Primary Use Cases

- **Sentimental Gifting:** Purchasing and building personalized virtual monuments for birthdays, anniversaries, or memorials with a custom dedication message.
- **Brands, Web3 Projects & Advertisers:** Companies claiming high-visibility central coordinates to build pixel-art logos, neon signs, and direct hyperlinks to promotional campaigns.
- **Gamers & Digital Artists:** Fans of sandbox tile games building intricate retro pixel art, mini-dungeons, or orbital habitats within a shared universe canvas.

---

## 4. Business Model & Stripe Pricing Architecture

The application utilizes a **Tiered Location & Feature Pricing Model** based on a star's radial distance from the galactic origin `(0, 0)` in 2D parsec-space.

### 4.1 Coordinate Pricing Tiers

Tier is derived deterministically from a star's 2D radius `r = hypot(x, y)` where `x`, `y` come from `bsc5p_3d.json`. Thresholds are chosen from the BSC5P distribution (n=9,101; p25≈51 pc, p50≈103 pc, p75≈186 pc):

| Tier Name                        | Price (One-Time) | Selection Criteria                                | Features & Entitlements                                                                                                                     |
| :------------------------------- | :--------------- | :------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------ |
| **Standard Outer Rim**           | **$4.99 USD**    | `r ≥ 200 pc` (long tail — majority of catalog)    | $32 \times 32$ Construction Plot. Basic Tile Palette (16 standard terrain/metal tiles). 280-character dedication.                           |
| **Constellation / System**       | **$14.99 USD**   | `50 ≤ r < 200 pc` (mid-band — roughly middle 50%) | $32 \times 32$ Construction Plot. Extended Palette (animated neon, bioluminescent flora). Star glow tint selector & custom particle effect. |
| **Core Center / Prime**          | **$49.99 USD**   | `r < 50 pc` (inner sphere — scarce)               | $32 \times 32$ Construction Plot. VIP Tile Palette (Gold, Holographic, Obsidian tiles). External link / social-handle embed on info card.   |
| **Mega-Plot Expansion (Upsell)** | **+$9.99 USD**   | Checkout add-on line item (any tier)              | Expands grid bounds from $32 \times 32$ to $64 \times 64$ tiles. Stored as `plots.expanded = true`.                                         |

### 4.2 Stripe Checkout & Plot Reservation Workflow

To prevent race conditions where multiple users attempt to buy the same star simultaneously:

1. **Selection:** User selects an available catalog star (identified by its BSC5P `i` key).
2. **Temporary Lock:** Backend takes a 300-second Redis lock keyed on `catalog_id`. Vacant = no `stars` row and no active Redis lock; no `VACANT` DB state is needed.
3. **Checkout Creation:** Backend initializes a Stripe Checkout Session with metadata: `catalog_id`, `star_name`, `dedication_text`, `user_id`, `tier`, and optional `mega_plot` flag.
4. **Payment Fulfillment:**
   - **On Success:** Stripe fires `checkout.session.completed`. Backend inserts the `stars` row (`status = CLAIMED`), provisions the `plots` row, releases the Redis lock, and emails confirmation.
   - **On Expiry/Cancel:** Redis TTL expires or `checkout.session.expired` fires; the lock is dropped and the star returns to selectable state.

**Webhook robustness requirements:**

- **Idempotency:** Dedupe by `event.id` (persisted table); repeated deliveries of the same event must be no-ops.
- **Raw body:** Next.js route handlers must read `await req.text()` before parsing so Stripe signature verification receives the exact bytes.
- **Handled events:** `checkout.session.completed`, `checkout.session.expired`. Later: `charge.refunded`, `charge.dispute.created`.

```
[ User Selects Catalog Star ]
            │
            ▼
[ Backend Locks catalog_id in Redis (5 Min TTL) ]
            │
            ▼
[ Create Stripe Checkout Session ]
  ├─ Metadata: catalog_id, star_name, dedication_text, user_id, tier, mega_plot
  └─ Amount derived from tier (+ Mega-Plot add-on if selected)
            │
            ▼
[ User Pays via Stripe Checkout ]
            │
            ▼
[ Stripe Webhook: checkout.session.completed ]
            │
            ▼
[ Insert stars row (status=CLAIMED) + plots row ]
  └─ Release Redis lock, send confirmation email
```

---

## 5. System Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND CLIENT                         │
│   Next.js 16 / React 19 (TypeScript)                            │
│   • PixiJS Galaxy Map Renderer  │  • PixiJS 32x32 Tile Editor   │
│   • 2D pan/zoom + LOD           │  • Tailwind v4 UI Controls    │
└────────────────────────────────┬────────────────────────────────┘
                                 │ REST (fetch)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND SERVICES                         │
│   Next.js route handlers under src/app/api/*                    │
│   • better-auth (email + session)  │ • Tile Matrix Serializer   │
│   • Stripe Webhook Handler         │ • Catalog Index (in-mem)   │
└────────────────┬───────────────────────────────┬────────────────┘
                 │                               │
                 ▼                               ▼
┌───────────────────────────────┐ ┌───────────────────────────────┐
│      DATABASE & STORAGE       │ │        CACHE & RENDERS        │
│ Supabase Postgres             │ │ Cloudflare R2                 │
│ • users (better-auth), stars, │ │ • Plot PNG thumbnails         │
│   plots, stripe_events        │ │ • CDN-fronted static assets   │
│ Redis                         │ │                               │
│ • Reservation locks (5 min)   │ │                               │
└───────────────────────────────┘ └───────────────────────────────┘
```

### Stack Breakdown

- **Frontend Framework:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS v4.
- **Canvas / Rendering Engine:** **PixiJS** for both the star map and the tile editor.
- **Backend Runtime:** Next.js route handlers under `src/app/api/*` (no separate Node service).
- **Auth:** **better-auth** — owns the `user`/`session`/`account` tables per its schema.
- **Payment Gateway:** Stripe Checkout API & Webhook Service.
- **Database Layer:** Supabase Postgres (relational metadata; plain btree indexes — no PostGIS needed for 2D catalog claims) + Redis (reservation locks).
- **Object Storage:** Cloudflare R2 (plot PNG thumbnails, CDN-fronted).
- **Thumbnail Renderer:** `@napi-rs/canvas` invoked from a background task triggered by `PUT /api/plots/:star_id`.

---

## 6. Functional Requirements & Feature Specifications

### 6.1 Galaxy Canvas Map

- **Pan & Zoom:** Smooth 2D pan/zoom viewport (PixiJS) with level-of-detail (LOD) rendering. The catalog `z` field may be used as a subtle parallax/depth hint but is not queryable.
- **Grid View Modes:**
  - _High Zoom:_ Shows individual pixel structures, animated blocks, and star glow.
  - _Low Zoom:_ Merges structures into glowing constellation nodes for performance optimization.
- **Star Point Data:** Shipped under `src/lib/galaxy/`:
  - `bsc5p_3d.json` — star coordinates (`x`, `y`, `z` in parsecs), luminosity, colour.
  - `bsc5p_names.json` — additional names.
  - `bsc5p_spectral_extra.json` — spectral information including cartoony glow colour.
  - `catalog.json` — merged view produced by `scripts/build-catalog.mjs` (see that script's `SOURCES` config to change what's included). This is what runtime code should load.

  > Note: the upstream BSC5P dataset also ships a `bsc5p_radec.json` (right-ascension/declination form). It is **not** included here; ignore the `bsc5p_radec` references in the key table below.

#### 6.2 Star Point Data - JSON keys and additional information

Because this catalog primarily targets video games, things are keep small for faster loading and efficient usage of bandwidth. JSON keys are usually a single character (2 characters for `to` / `or` field in the `spectral_extra` file). This often reduces each file by over 50% which, due to the massive amount of star data, equates to megabytes for some files.

The table below describes what each of these keys mean, and lists the files that use them.

| Key | Type           | Symbol | Used by                                         | Description                                                                                                                                                                           |
| :-- | :------------- | :----- | :---------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `i` | number, string | --     | `bsc5p_3d` `bsc5p_names` `bsc5p_spectral_extra` | Original BSC5P line ID, or 'Custom [n]' if added via the amendments mechanism. Used to link stars between files. This is the canonical **claim identity** (`stars.catalog_id`).       |
| `n` | string         | --     | `bsc5p_3d`                                      | A single name given to star. Additional known names for each star stored in `bsc5p_names.json`.                                                                                       |
| `p` | number         | `pc`   | `bsc5p_3d`                                      | Distance in parsecs, ignoring uncertainty. 1 parsec ≈ 3.26 light-years.                                                                                                               |
| `x` | number         | --     | `bsc5p_3d`                                      | `x` coordinate approximation in parsecs. Used for 2D projection and tier computation.                                                                                                 |
| `y` | number         | --     | `bsc5p_3d`                                      | `y` coordinate approximation in parsecs. Used for 2D projection and tier computation.                                                                                                 |
| `z` | number         | --     | `bsc5p_3d`                                      | `z` coordinate approximation in parsecs. Visual/parallax only — not used for queries or tiering.                                                                                      |
| `N` | number         | `L☉`   | `bsc5p_3d`                                      | Naively calculated luminosity. Used for star size / brightness falloff (see [Inverse Square Law of Brightness](http://www.astronomy.ohio-state.edu/~pogge/Ast162/Unit1/bright.html)). |
| `K` | vector3        | `K`    | `bsc5p_3d`                                      | Colour of star approximated from star temperature (blackbody) converted to RGB.                                                                                                       |

**Spectral information**

Below follows extra spectral information only found in the `bsc5p_spectral_extra` file.

| Key  | Type           | Symbol      | Description                                                                                                                                        |
| ---- | -------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `L`  | number         | `L☉`        | Real luminosity as determined by academic sources. Very few stars in this catalog have this value defined due to the difficulty in determining it. |
| `b`  | number         | `m`, `vMag` | Apparent brightness (also known as apparent magnitude, visual magnitude; not to be confused with absolute magnitude).                              |
| `a`  | number         | `M`, `VMag` | Naively calculated absolute magnitude. This does not take dust and other obstruction into account.                                                 |
| `g`  | string         | --          | Colour or glow of star, but cartoony instead of real.                                                                                              |
| `s`  | string         | --          | Spectral classification.                                                                                                                           |
| `C`  | string         | --          | Spectral type classification (O, B, A, F, G, K, M).                                                                                                |
| `S`  | number         | --          | Spectral type subclass (0-9). 0=hottest, 9=coldest. Fractions exist (eg. Mu Normae is O9.7 \[that's an `O`, not a `0`]).                           |
| `L`  | number         | --          | Luminosity class. Higher numbers generally mean lower surface temperatures.                                                                        |
| `to` | object or null | --          | If specified, the star is in range of the above and whatever is specified here. Used to indicate uncertainty.                                      |
| `or` | object or null | --          | If specified, the star is either the above or whatever is specified in this object. Used to indicate uncertainty.                                  |
| `e`¹ | array          | --          | Containing siblings, if the original data was presented that way.                                                                                  |
| `q`  | string         | --          | Skipped spectral information. These usually contain peculiarities in spectral lines, but may also contain data the parser did not understand.      |

### 6.3 2D Tile Builder Engine

- **Grid Constraints:** Fixed $32 \times 32$ grid cells per plot (expandable to $64 \times 64$ via Mega-Plot upsell — `plots.expanded = true`).
- **Editing Suite Tools:**
  - **Pencil / Tile Brush:** Single-tile or multi-tile placement.
  - **Eraser:** Clears tile cell back to transparent background.
  - **Eyedropper:** Samples existing tile type from canvas.
  - **Fill Bucket:** Fills contiguous identical tile regions.
  - **Undo / Redo Stack:** Minimum 20-step local history stack.
  - **Clear Plot:** Resets entire canvas to blank state (requires confirmation prompt).
- **Tile Categories:**
  1. _Structural:_ Sci-fi hull plates, solar panels, metal beams, glass walls, brickwork.
  2. _Decorations:_ Retro furniture, alien flora, space antennas, structural pipes.
  3. _Lighting / Neon:_ Glowing neon tubes, flashing alert lights, spotlights.
  4. _Special:_ Animated thrusters, energy fields, particle emitters.
- **Palette source of truth:** A static TypeScript module at `src/lib/tiles/palette.ts` maps each `tile_id` (integer) to `{ sprite, category, minTier }`. `tile_data` in the database stores only integer tile IDs; sprites and tier-gating rules are resolved client- and server-side from this module. Server-side validation on `PUT /api/plots/:star_id` rejects tile IDs that exceed the plot's tier entitlement.

### 6.4 Social & Inspect Features

- **Star Information Drawer:** Clicking an occupied star opens a slide-over modal containing:
  - A graphical ring should show around the star.
  - Star Name and Coordinates $(X, Y)$ (parsecs).
  - Dedication Message & Owner Identifier.
  - Rendered high-res pixel art thumbnail preview.
  - Action buttons: "Copy Direct Link", "Edit Plot" (if owner), "Visit External Website" (Prime Tier).
- **Deep Linking System:** Share URLs structured as `https://starbuilder.app/star?x=120&y=-45`. On load, the client snaps to the nearest catalog star to `(x, y)` and pans the viewport to it. (Direct `?catalog_id=` links are also supported for exact addressing.)

---

## 7. Data Models & Database Schema

### 7.1 Entity Relationship Diagram (Conceptual)

`user` **1 ─── <** `stars` **1 ─── 1** `plots`

### 7.2 Table Schemas

#### `user`

Managed by **better-auth** — see the better-auth schema for `user`, `session`, `account`, and `verification` tables. Application code references `user.id` from `stars.user_id`. If additional profile fields (e.g. `username`) are needed, add them via better-auth's `additionalFields` config rather than a parallel table.

#### `stars`

Defined in src/supabase/migration/00000000000000_schema.sql

#### `plots`

Not yet finalized but inialial suggested schema may look like this. TBD.

| Field Name      | Type         | Constraints                            | Description                                                                                               |
| :-------------- | :----------- | :------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| `id`            | UUID         | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique plot identifier                                                                                    |
| `star_id`       | UUID         | FOREIGN KEY -> stars(id), UNIQUE       | Associated star reference                                                                                 |
| `expanded`      | BOOLEAN      | NOT NULL, DEFAULT false                | true = Mega-Plot ($64\times64$); false = standard ($32\times32$). `width`/`height` are derived from this. |
| `tile_data`     | JSONB        | NOT NULL                               | Serialized tile matrix (integer tile IDs; rotations encoded per palette)                                  |
| `thumbnail_url` | VARCHAR(512) | NULLABLE                               | R2 URL for generated PNG preview                                                                          |
| `updated_at`    | TIMESTAMP    | DEFAULT CURRENT_TIMESTAMP              | Last tile update timestamp                                                                                |

#### `stripe_events`

Not yet finalized but inialial suggested schema may look like this. TBD.

Idempotency ledger for Stripe webhook deliveries.

| Field Name     | Type         | Constraints               | Description                       |
| :------------- | :----------- | :------------------------ | :-------------------------------- |
| `event_id`     | VARCHAR(255) | PRIMARY KEY               | Stripe `event.id`                 |
| `type`         | VARCHAR(100) | NOT NULL                  | e.g. `checkout.session.completed` |
| `processed_at` | TIMESTAMP    | DEFAULT CURRENT_TIMESTAMP | First-seen timestamp              |

---

## 8. API Endpoint Specifications

### 8.1 Checkout & Payment Endpoints

- `POST /api/checkout/reserve`
  - **Request Body:** `{ catalog_id: string, star_name: string, dedication_text: string, mega_plot?: boolean }`
  - **Response:** `{ checkout_url: string, expires_at: timestamp }`
  - **Logic:** Resolves `catalog_id` in the in-memory catalog index, computes tier from radius, checks availability (no `stars` row, no Redis lock), takes a 5-minute Redis lock, creates a Stripe Session with the metadata above, returns checkout URL.

- `POST /api/webhooks/stripe`
  - **Headers:** `Stripe-Signature`
  - **Event Handling:** `checkout.session.completed`, `checkout.session.expired`
  - **Logic:** Reads raw request body via `await req.text()`, verifies signature, dedupes against `stripe_events`, then: on `completed` inserts `stars` (`status = CLAIMED`) + `plots` rows and releases the Redis lock; on `expired` releases the Redis lock. Sends confirmation email on `completed`.

### 8.2 Tile Matrix & Canvas Endpoints

- `GET /api/map/chunks`
  - **Query Params:** `min_x`, `max_x`, `min_y`, `max_y` (parsecs)
  - **Response:** Array of occupied stars (id, catalog_id, coord_x, coord_y, tier, star_name, thumbnail_url) within viewport bounds.

- `GET /api/plots/:star_id`
  - **Response:** Full `tile_data` JSON structure and metadata for editor loading.

- `PUT /api/plots/:star_id`
  - **Authentication:** Required (owner only, via better-auth session).
  - **Request Body:** `{ tile_data: JSONB }`
  - **Response:** `{ success: boolean, thumbnail_url: string }`
  - **Logic:** Validates payload size and tile-ID tier entitlement (per `src/lib/tiles/palette.ts`), saves matrix to DB, enqueues a background task that renders a PNG via `@napi-rs/canvas` and uploads it to Cloudflare R2.

---

## 9. Development Milestones & Roadmap

```
Phase 1: Galaxy Map & Spatial Database (Weeks 1-3)
 ├─ Implement 2D pan/zoom PixiJS viewport with LOD
 ├─ Load BSC5P catalog, project x/y, compute radial tier at query time
 ├─ Set up Supabase schema (stars, plots, stripe_events), map/chunks API
 ├─ Real-time rendering of claimed star plots on main map
 └─ Each star clickable, rendering a ring around the selected star and the name and $(X, Y)$ displayed in an overlay in the bottom left.

Phase 2: Core Tile Builder Engine (Weeks 4-6)
 ├─ Build 32x32 canvas grid editor in React/PixiJS
 ├─ Implement draw, erase, eyedropper, and tile palette selector
 └─ Local state serialization testing

Phase 3: Stripe Payments & Lock Engine (Weeks 7-9)
 ├─ Redis coordinate lock mechanism (5-minute expiration)
 ├─ Stripe Checkout integration & idempotent webhook handler
 └─ better-auth wire-up and owner-gated editor access

Phase 4: Optimization, CDN Renders & Social Polish (Weeks 10-12)
 ├─ @napi-rs/canvas PNG thumbnail generator → Cloudflare R2 upload
 ├─ Deep-linking URL coordinate navigation system
 └─ Sound effects, UI animations, and launch prep
```
