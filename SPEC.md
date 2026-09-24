# Product Specification Document (SPEC.MD)

**Project Name:** Star-Builder (Working Title)  
**Document Version:** 1.2.0  
**Status:** Draft / Initial Specification

---

## 1. Executive Summary & Concept Overview

**Star-Builder** is a persistent, multiplayer web application that bridges the gap between sentimental online star registration, digital real-estate advertising, and creative retro sandbox gaming (such as _Terraria_ or _Starbound_).

Users explore a stylized **night-sky view** of a shared galaxy field. The claimable universe is the finite **BSC5P catalog (~9,101 real stars)** rendered through a gnomonic projection (see §6.5) so the pan/zoom experience mimics looking through a telescope. On this map, users can purchase, name, and dedicate vacant catalog stars. Upon claiming a star, the user receives an associated $32 \times 32$ pixel construction plot anchored directly to their celestial location. Using an integrated 2D pixel-art builder engine, owners can construct custom pixel structures, sci-fi habitats, neon billboards, monuments, or creative art pieces that are permanently rendered onto the public universe map for all visitors to discover.

---

## 2. Core User Experience & Application Loop

The user interaction follows a tightly designed 4-step loop:

```
┌─────────────────────────────────────────────────────────┐
│ 1. EXPLORE & SELECT                                     │
│ Navigate the night sky, locate vacant catalog stars,     │
│ and inspect registered star structures and dedications.  │
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
│ Share unique stars via direct deep-link URLs.           │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Target Audience & Primary Use Cases

- **Sentimental Gifting:** Purchasing and building personalized virtual monuments for birthdays, anniversaries, or memorials with a custom dedication message.
- **Brands, Web3 Projects & Advertisers:** Companies claiming high-visibility bright stars to build pixel-art logos, neon signs, and direct hyperlinks to promotional campaigns.
- **Gamers & Digital Artists:** Fans of sandbox tile games building intricate retro pixel art, mini-dungeons, or orbital habitats within a shared universe canvas.

---

## 4. Business Model & Stripe Pricing Architecture

The application uses a **brightness-tiered pricing model**: the visually brightest stars (the ones humans actually recognize — Sirius, Vega, Betelgeuse, etc.) are premium; everything else is standard.

### 4.1 Coordinate Pricing Tiers

Tier is derived from apparent magnitude `b` in `bsc5p_spectral_extra.json` (lower `b` = brighter). Threshold picked from the BSC5P distribution: `b < 3.0` captures the top ~175 stars (~1.9% of catalog) — approximately the "named naked-eye" set.

| Tier Name | Price (One-Time) | Selection Criteria | Features & Entitlements |
| :--- | :--- | :--- | :--- |
| **Standard** | **$4.99 USD** | `b ≥ 3.0` (~8,926 stars — majority of catalog) | $32 \times 32$ Construction Plot. Basic Tile Palette (16 standard terrain/metal tiles). 280-character dedication. |
| **Prime** | **$49.99 USD** | `b < 3.0` (~175 stars — visually prominent, often named) | $32 \times 32$ Construction Plot. VIP Tile Palette (Gold, Holographic, Obsidian tiles). External link / social-handle embed on info card. |
| **Mega-Plot Expansion (Upsell)** | **+$9.99 USD** | Checkout add-on line item (either tier) | Expands grid bounds from $32 \times 32$ to $64 \times 64$ tiles. Stored as `plots.expanded = true`. |

### 4.2 Stripe Checkout & Plot Reservation Workflow

Race-condition prevention piggybacks on the `stars.id` unique constraint: `id` is the BSC5P catalog key, so an `INSERT` from a second buyer for the same star conflicts and fails. Redis is not required for reservation atomicity.

1. **Selection:** User selects a vacant catalog star (identified by its BSC5P `i` key).
2. **Reserve:** `POST /api/checkout/reserve` runs `INSERT INTO stars (id, ..., status='RESERVED', reservation_expires_at = now() + interval '5 minutes')`. On conflict, returns 409.
3. **Checkout Creation:** Backend initializes a Stripe Checkout Session with metadata: `catalog_id`, `star_name`, `dedication_text`, `user_id`, `tier`, and optional `mega_plot` flag.
4. **Payment Fulfillment:**
   - **On Success:** Stripe fires `checkout.session.completed`. Backend `UPDATE stars SET status='CLAIMED', stripe_payment_id=... WHERE id=$1 AND status='RESERVED'`, provisions the `plots` row, and emails confirmation.
   - **On Expiry/Cancel:** `checkout.session.expired` fires OR a scheduled sweep runs `DELETE FROM stars WHERE status='RESERVED' AND reservation_expires_at < now()`.

**Webhook robustness requirements:**

- **Idempotency:** Dedupe by `event.id` (`stripe_events` table); repeated deliveries of the same event must be no-ops.
- **Raw body:** Next.js route handlers must read `await req.text()` before parsing so Stripe signature verification receives the exact bytes.
- **Handled events:** `checkout.session.completed`, `checkout.session.expired`. Later: `charge.refunded`, `charge.dispute.created`.

```
[ User Selects Catalog Star ]
            │
            ▼
[ INSERT stars (status=RESERVED, expires=now+5min) ]
   └─ ON CONFLICT → return 409 (someone else got there first)
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
[ UPDATE stars SET status=CLAIMED + provision plots row ]
  └─ Send confirmation email
```

The `star_status` enum still defines `AVAILABLE`, but it's unused in practice: rows exist only for `RESERVED` and `CLAIMED` stars.

---

## 5. System Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND CLIENT                         │
│   Next.js 16 / React 19 (TypeScript)                            │
│   • PixiJS Night-Sky Renderer   │  • PixiJS 32x32 Tile Editor   │
│   • Gnomonic projection + LOD   │  • Tailwind v4 UI Controls    │
└────────────────────────────────┬────────────────────────────────┘
                                 │ REST (fetch)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND SERVICES                         │
│   Next.js route handlers under src/app/api/*                    │
│   • Supabase Auth (auth.users)  │ • Tile Matrix Serializer      │
│   • Stripe Webhook Handler      │ • Catalog Lookup (in-mem)     │
└────────────────┬────────────────────────────────┬───────────────┘
                 │                                │
                 ▼                                ▼
┌───────────────────────────────┐ ┌───────────────────────────────┐
│      DATABASE & STORAGE       │ │        CACHE & RENDERS        │
│ Supabase Postgres             │ │ Cloudflare R2                 │
│ • auth.users (Supabase Auth), │ │ • Plot PNG thumbnails         │
│   stars, plots, stripe_events │ │ • CDN-fronted static assets   │
│ • `stars.id` unique = reserve │ │                               │
│   lock (no Redis needed)      │ │                               │
└───────────────────────────────┘ └───────────────────────────────┘
```

### Stack Breakdown

- **Frontend Framework:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS v4.
- **Canvas / Rendering Engine:** **PixiJS** for both the night-sky map and the tile editor.
- **Backend Runtime:** Next.js route handlers under `src/app/api/*` (no separate Node service).
- **Auth:** **Supabase Auth** — application code references `auth.users(id)` from `stars.user_id`.
- **Payment Gateway:** Stripe Checkout API & Webhook Service.
- **Database Layer:** Supabase Postgres. Reservation locking uses the `stars.id` unique constraint — Redis is not required in Phase 1.
- **Object Storage:** Cloudflare R2 (plot PNG thumbnails, CDN-fronted).
- **Thumbnail Renderer:** `@napi-rs/canvas` invoked from a background task triggered by `PUT /api/plots/:star_id`.

---

## 6. Functional Requirements & Feature Specifications

### 6.1 Galaxy Canvas Map

- **Pan & Zoom:** Smooth night-sky pan/zoom (PixiJS) rendered via the gnomonic projection in §6.5. The camera has three inputs: right-ascension center `α₀`, declination center `δ₀`, and zoom scale `R`.
- **View Modes:**
  - _High Zoom (large R):_ Shows individual pixel structures on claimed stars, animated blocks, and star glow.
  - _Low Zoom (small R):_ Merges structures into glowing constellation nodes for performance optimization.
- **Star Point Data:** Shipped under `src/lib/galaxy/`:
  - `bsc5p_3d.json` — star coordinates (`x`, `y`, `z` in parsecs), luminosity, colour.
  - `bsc5p_names.json` — additional names.
  - `bsc5p_spectral_extra.json` — spectral information including apparent magnitude `b` (used for tiering).
  - `catalog.json` — merged view produced by `scripts/build-catalog.mjs` (see that script's `SOURCES` config to change what's included). This is what runtime code should load. Ship as a static asset (gzipped is ~200 KB).

  > Note: the upstream BSC5P dataset also ships a `bsc5p_radec.json` (right-ascension/declination form). It is **not** included here; RA/Dec are computed at load time from the `x/y/z` fields (see §6.5 Step 1).

#### 6.2 Star Point Data - JSON keys and additional information

Because this catalog primarily targets video games, things are kept small for faster loading and efficient usage of bandwidth. JSON keys are usually a single character (2 characters for `to` / `or` field in the `spectral_extra` file). This often reduces each file by over 50% which, due to the massive amount of star data, equates to megabytes for some files.

The table below describes what each of these keys mean, and lists the files that use them.

| Key | Type           | Symbol | Used by                                         | Description                                                                                                                                                                           |
| :-- | :------------- | :----- | :---------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `i` | number, string | --     | `bsc5p_3d` `bsc5p_names` `bsc5p_spectral_extra` | Original BSC5P line ID, or 'Custom [n]' if added via the amendments mechanism. Used to link stars between files. This is the canonical **claim identity** (`stars.id`).               |
| `n` | string         | --     | `bsc5p_3d`                                      | A single name given to star. Additional known names for each star stored in `bsc5p_names.json`.                                                                                       |
| `p` | number         | `pc`   | `bsc5p_3d`                                      | Distance in parsecs, ignoring uncertainty. 1 parsec ≈ 3.26 light-years.                                                                                                               |
| `x` | number         | --     | `bsc5p_3d`                                      | `x` coordinate approximation in parsecs. Fed into the gnomonic projection (§6.5).                                                                                                     |
| `y` | number         | --     | `bsc5p_3d`                                      | `y` coordinate approximation in parsecs. Fed into the gnomonic projection (§6.5).                                                                                                     |
| `z` | number         | --     | `bsc5p_3d`                                      | `z` coordinate approximation in parsecs. Fed into the gnomonic projection (§6.5).                                                                                                     |
| `N` | number         | `L☉`   | `bsc5p_3d`                                      | Naively calculated luminosity. Used for star size / brightness falloff (see [Inverse Square Law of Brightness](http://www.astronomy.ohio-state.edu/~pogge/Ast162/Unit1/bright.html)). |
| `K` | vector3        | `K`    | `bsc5p_3d`                                      | Colour of star approximated from star temperature (blackbody) converted to RGB.                                                                                                       |

**Spectral information**

Below follows extra spectral information only found in the `bsc5p_spectral_extra` file.

| Key  | Type           | Symbol      | Description                                                                                                                                        |
| ---- | -------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `L`  | number         | `L☉`        | Real luminosity as determined by academic sources. Very few stars in this catalog have this value defined due to the difficulty in determining it. |
| `b`  | number         | `m`, `vMag` | Apparent brightness (apparent magnitude). **Drives tier assignment** (see §4.1). Lower = brighter.                                                 |
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
  - Star Name and BSC5P identifier.
  - Dedication Message & Owner Identifier.
  - Rendered high-res pixel art thumbnail preview.
  - Action buttons: "Copy Direct Link", "Edit Plot" (if owner), "Visit External Website" (Prime Tier).
- **Deep Linking System:** Share URLs structured as `https://starbuilder.app/star?id=<catalog_id>`. On load, the client looks up the star in `catalog.json`, computes its `(α, δ)`, and centers the camera on it. (Legacy `?x=&y=&z=` form may be accepted as a fallback for pasted parsec coords.)

### 6.5 How the star map should be generated from the star catalog data

For a zoomable "Night Sky View" centered on a specific point in the sky, the absolute best method is the Gnomonic Projection.
While a Stereographic projection is excellent for viewing an entire hemisphere at once, a Gnomonic projection perfectly mimics looking through a camera lens or a telescope. When you change the focal length (zoom in and out), the geometry stays perfectly uniform without bending constellations at the edges of your view.
Alternatively, if you want a projection that doesn't distort shapes near the edges when zoomed far out, the Stereographic Projection is your best secondary choice.
Here is how to structure your math to handle both the celestial conversion and the dynamic zooming.

Step 1: Convert XYZ to Angles (Right Ascension & Declination)
First, turn your raw Cartesian 3D coordinates into spherical coordinates.

1.  Distance ($r$): $\sqrt{X^2 + Y^2 + Z^2}$
2.  Declination ($\delta$): $\arcsin(Z / r)$
3.  Right Ascension ($\alpha$): $\operatorname{atan2}(Y, X)$

Step 2: Center the View (Camera Target)
Because the user is looking at a specific patch of sky and zooming in, you must define where the "camera" is pointing. Let this center point be $(\alpha_0, \delta_0)$.
When the user pans across the night sky, you will update $\alpha_0$ and $\delta_0$.

Step 3: Compute the 2D Projection with Zoom
Use the Gnomonic math combined with a scale factor ($R$) to act as your zoom controller.
First, calculate the angular distance component ($c$) between the star and the center of your screen:
$$\cos(c) = \sin(\delta_0)\sin(\delta) + \cos(\delta_0)\cos(\delta)\cos(\alpha - \alpha_0)$$
If $\cos(c) \le 0$, the star is more than 90° away from the center point (behind the local horizon of your screen view) and should not be rendered.
If it is visible, calculate your 2D $(u, v)$ coordinates:
$$u = \frac{R \cdot \cos(\delta)\sin(\alpha - \alpha_0)}{\cos(c)}$$
$$v = \frac{R \cdot \big(\cos(\delta_0)\sin(\delta) - \sin(\delta_0)\cos(\delta)\cos(\alpha - \alpha_0)\big)}{\cos(c)}$$

How to Handle the Zoom Factor ($R$)

- Zooming In: Increase the value of $R$. This stretches the coordinates outward, scattering the stars further apart and magnifying the center patch of sky.
- Zooming Out: Decrease the value of $R$. This pulls coordinates closer to the origin $(0,0)$, packing more stars onto the screen.

## 7. Data Models & Database Schema

### 7.1 Entity Relationship Diagram (Conceptual)

`auth.users` **1 ─── <** `stars` **1 ─── 1** `plots`

### 7.2 Table Schemas

#### `auth.users`

Managed by **Supabase Auth**. Application code references `auth.users(id)` from `stars.user_id`. Public-facing profile fields (username, display name) should live in a `public.profiles` table joined by `id` when needed — deferred until Phase 3.

#### `stars`

Defined in `supabase/migrations/00000000000000_schema.sql`, extended by `supabase/migrations/20260924120000_add_dedication_plots_stripe_events.sql`. Key characteristics:

- `id integer primary key` — this is the BSC5P `i`. The unique constraint doubles as the reservation lock.
- `user_id uuid references auth.users(id)` — Supabase Auth owner.
- `coord_x`, `coord_y integer` — retained but unused in Phase 1 (client renders from `catalog.json`). Reserved for future server-side spatial queries if needed.
- `star_name text not null`, `dedication_text text` (nullable; ≤ 280 chars, added in the second migration).
- `tier tier` — enum `('STANDARD', 'PRIME')`. Computed at reserve time from catalog `b`.
- `status star_status` — enum `('AVAILABLE', 'RESERVED', 'CLAIMED')`. `AVAILABLE` is defined but unused; rows exist only for `RESERVED` and `CLAIMED`.
- `reservation_expires_at timestamptz` — sweep target for stale `RESERVED` rows.
- `stripe_session_id text`, `stripe_payment_id text` — set at reserve / webhook time.
- RLS: public `select`, authenticated `insert` (owner only), owner `update`.

#### `plots`

Provisioned in the second migration.

| Field Name      | Type         | Constraints                                          | Description                                                                                               |
| :-------------- | :----------- | :--------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| `id`            | bigint       | generated always as identity primary key             | Unique plot identifier                                                                                    |
| `star_id`       | integer      | not null, unique, references stars(id) on delete cascade | Associated star reference                                                                              |
| `expanded`      | boolean      | not null default false                               | true = Mega-Plot ($64\times64$); false = standard ($32\times32$). `width`/`height` are derived from this. |
| `tile_data`     | jsonb        | not null default '[]'::jsonb                         | Serialized tile matrix (integer tile IDs; rotations encoded per palette)                                  |
| `thumbnail_url` | text         | null                                                 | R2 URL for generated PNG preview                                                                          |
| `updated_at`    | timestamptz  | not null default now()                               | Last tile update timestamp                                                                                |

#### `stripe_events`

Idempotency ledger for Stripe webhook deliveries. Provisioned in the second migration.

| Field Name     | Type        | Constraints              | Description                       |
| :------------- | :---------- | :----------------------- | :-------------------------------- |
| `event_id`     | text        | primary key              | Stripe `event.id`                 |
| `type`         | text        | not null                 | e.g. `checkout.session.completed` |
| `processed_at` | timestamptz | not null default now()   | First-seen timestamp              |

---

## 8. API Endpoint Specifications

### 8.1 Checkout & Payment Endpoints

- `POST /api/checkout/reserve`
  - **Request Body:** `{ catalog_id: number, star_name: string, dedication_text: string, mega_plot?: boolean }`
  - **Response:** `{ checkout_url: string, expires_at: timestamp }` (409 on conflict)
  - **Logic:** Looks up `catalog_id` in the in-memory catalog, derives `tier` from `b`, `INSERT`s a `stars` row with `status='RESERVED'` and `reservation_expires_at = now() + 5 minutes`. On `unique_violation`, returns 409 (star is already reserved or claimed). Creates a Stripe Session with the metadata above; returns checkout URL.

- `POST /api/webhooks/stripe`
  - **Headers:** `Stripe-Signature`
  - **Event Handling:** `checkout.session.completed`, `checkout.session.expired`
  - **Logic:** Reads raw request body via `await req.text()`, verifies signature, dedupes against `stripe_events`, then: on `completed` `UPDATE`s `stars.status = 'CLAIMED'` + inserts `plots` row; on `expired` `DELETE`s the `RESERVED` row. Sends confirmation email on `completed`.

- Scheduled sweep (pg_cron, every minute): `DELETE FROM stars WHERE status = 'RESERVED' AND reservation_expires_at < now()`.

### 8.2 Star & Plot Endpoints

- `GET /api/stars`
  - **Response:** Array of currently-claimed (and reserved, if useful for UI) stars: `{ id, star_name, tier, status, user_id, updated_at }[]`.
  - **Logic:** The client already has the full catalog statically; this endpoint returns only the small set of DB-backed rows so the map can highlight/join them. No chunking or viewport params in Phase 1.

- `GET /api/plots/:star_id`
  - **Response:** Full `tile_data` JSON structure and metadata for editor loading.

- `PUT /api/plots/:star_id`
  - **Authentication:** Required (owner only, via Supabase Auth session).
  - **Request Body:** `{ tile_data: JSONB }`
  - **Response:** `{ success: boolean, thumbnail_url: string }`
  - **Logic:** Validates payload size and tile-ID tier entitlement (per `src/lib/tiles/palette.ts`), saves matrix to DB, enqueues a background task that renders a PNG via `@napi-rs/canvas` and uploads it to Cloudflare R2.

---

## 9. Development Milestones & Roadmap

```
Phase 1: Galaxy Map & Spatial Database (Weeks 1-3)
 ├─ Implement gnomonic-projection PixiJS viewport with pan/zoom + LOD
 ├─ Load catalog.json client-side; render all ~9k stars sized by luminosity
 ├─ /api/stars returns claimed rows; client highlights those on the map
 ├─ Star click → ring + info overlay (name, catalog id) bottom-left
 └─ Supabase schema extensions: dedication_text, plots, stripe_events

Phase 2: Core Tile Builder Engine (Weeks 4-6)
 ├─ Build 32x32 canvas grid editor in React/PixiJS
 ├─ Implement draw, erase, eyedropper, and tile palette selector
 └─ Local state serialization testing

Phase 3: Stripe Payments & Auth (Weeks 7-9)
 ├─ Supabase Auth wire-up (email + provider), owner-gated editor access
 ├─ /api/checkout/reserve with INSERT-based race prevention
 ├─ Stripe Checkout integration & idempotent webhook handler
 └─ pg_cron reservation sweep

Phase 4: Optimization, CDN Renders & Social Polish (Weeks 10-12)
 ├─ @napi-rs/canvas PNG thumbnail generator → Cloudflare R2 upload
 ├─ Deep-linking URL (?id=<catalog_id>) navigation system
 └─ Sound effects, UI animations, and launch prep
```
