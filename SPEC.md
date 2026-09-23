# Product Specification Document (SPEC.MD)

**Project Name:** Star-Builder (Working Title)  
**Document Version:** 1.0.0  
**Status:** Draft / Initial Specification

---

## 1. Executive Summary & Concept Overview

**Star-Builder** is a persistent, multiplayer web application that bridges the gap between sentimental online star registration, digital real-estate advertising, and creative retro sandbox gaming (such as _Terraria_ or _Starbound_).

Users explore an infinite, stylized 3D canvas star map representing a shared galaxy field. On this map, users can purchase, name, and dedicate vacant star coordinates. Upon claiming a star, the user receives an associated $32 \times 32$ pixel construction plot anchored directly to their celestial location. Using an integrated 2D pixel-art builder engine, owners can construct custom pixel structures, sci-fi habitats, neon billboards, monuments, or creative art pieces that are permanently rendered onto the public universe map for all visitors to discover.

---

## 2. Core User Experience & Application Loop

The user interaction follows a tightly designed 4-step loop:

```
┌─────────────────────────────────────────────────────────┐
│ 1. EXPLORE & SELECT                                     │
│ Navigate galaxy map, locate vacant coordinates, and      │
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
│ Changes commit live to the infinite galaxy map.         │
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

The application utilizes a **Tiered Location & Feature Pricing Model** based on coordinate prominence and visual appeal across the galaxy map.

### 4.1 Coordinate Pricing Tiers

| Tier Name | Price (One-Time) | Coordinate Criteria | Features & Entitlements
| **Standard Outer Rim** | **$4.99 USD** | Outer sector grid | Standard $32 \times 32$ Construction Plot. Basic Tile Palette (16 standard terrain/metal tiles). 280-character dedication message |
| **Constellation / System** | **$14.99 USD** | Outer sector grid | Standard $32 \times 32$ Construction Plot. Extended Palette (Animated neon, bioluminescent flora). Star glow tint selector & custom particle effect |
| **Core Center / Prime** | **$49.99 USD** | Central galactic hub | Standard $32 \times 32$ Construction Plot. VIP Tile Palette (Gold, Holographic, Obsidian tiles). External link / social handle embed on info card |
| **Mega-Plot Expansion (Upsell)** | **+$9.99 USD** | Add-on to any existing star transaction | Expands grid bounds from $32 \times 32$ to $64 \times 64$ tiles |

### 4.2 Stripe Checkout & Plot Reservation Workflow

To prevent race conditions where multiple users attempt to buy the same coordinate simultaneously:

1. **Selection:** User selects an available coordinate $(X, Y, Z)$.
2. **Temporary Lock:** Backend receives a reservation request and marks coordinate status as `RESERVED` for 300 seconds (5 minutes) in Redis / Database.
3. **Checkout Creation:** Backend initializes a Stripe Checkout Session containing metadata: `coord_x`, `coord_y`, `star_name`, `dedication_text`, and `user_id`.
4. **Payment Fulfillment:**
   - **On Success:** Stripe fires `checkout.session.completed` webhook. Backend converts status from `RESERVED` to `CLAIMED`, releases lock, assigns ownership, and sends confirmation.
   - **On Expiry/Cancel:** The 5-minute lock expires, resetting status back to `VACANT`.

```
[ User Selects Coordinate ]
            │
            ▼
[ Backend Locks Plot (5 Min Expiry) ]
            │
            ▼
[ Create Stripe Checkout Session ]
  ├─ Metadata: star_name, coord_x, coord_y, coord_z, user_id, tier
  └─ Amount based on coordinate distance
            │
            ▼
[ User Pays via Stripe Checkout ]
            │
            ▼
[ Stripe Webhook: checkout.session.completed ]
            │
            ▼
[ Transition Database Status: RESERVED -> CLAIMED ]
  └─ Provision 32x32 Plot Record in Database
```

---

## 5. System Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND CLIENT                         │
│   Next.js / React (TypeScript)  │  Three.js / HTML5 Canvas API  │
│   • Galaxy Map Renderer         │  • 32x32 Tile Builder Engine  │
│   • WebGL Tile Layering         │  • Tailwind CSS UI Controls   │
└────────────────────────────────┬────────────────────────────────┘
                                 │ REST / WebSockets
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND SERVICES                         │
│   Next.js under app/api/*                                                   │
│   • Better Auth                │ • Tile Matrix Serializer       │
│   • Stripe Webhook Handler     │ • Quadtree Map Engine          │
└────────────────┬───────────────────────────────┬────────────────┘
                 │                               │
                 ▼                               ▼
┌───────────────────────────────┐ ┌───────────────────────────────┐
│      DATABASE & STORAGE       │ │        CACHE & RENDERS        │
│ Supabase (PostGIS / Data)     │ │ Cloudflare R2                 │
│ • Users, Stars, Tile Matrices │ │ • Static Map Tile Snapshots   │
│ Redis                         │ │ • Dynamic CDN Caching         │
│ • Plot Locks & Sessions       │ │                               │
└───────────────────────────────┘ └───────────────────────────────┘
```

### Stack Breakdown

- **Frontend Framework:** Next.js (React), TypeScript, Tailwind CSS.
- **Canvas / Rendering Engine:** Three for the star map rendering engine.
- **Backend Runtime:** Node.js (TypeScript).
- **Payment Gateway:** Stripe Checkout API & Webhook Service.
- **Database Layer:** Supabase (for relational metadata and spatial indices) + Redis (for instant plot reservation locking).

---

## 6. Functional Requirements & Feature Specifications

### 6.1 Galaxy Canvas Map

- **Pan & Zoom:** Smooth scrolling infinite 3D canvas with level-of-detail (LOD) rendering.
- **Grid View Modes:**
  - _High Zoom:_ Shows individual pixel structures, animated blocks, and star glow.
  - _Low Zoom:_ Merges structures into glowing constellation nodes for performance optimization.
- **Star Point Data:** The star data is currently in the following files:
  - _src/lib/galaxy/bsc5p_3d.json_ star coordinates
  - _src/lib/galaxy/bsc5p_name.json_ additional names
  - _src/lib/galaxy/bsc5p_spectral_extra.json_ addition spectral information including color

#### 6.2 Star Point Data - JSON keys and additional information

Because this catalog primarily targets video games, things are keep small for faster loading and efficient usage of bandwidth. JSON keys are usually a single character (2 characters for `to` / `or` field in the `spectral_extra` file). This often reduces each file by over 50% which, due to the massive amount of star data, equates to megabytes for some files.

The table below describes what each of these keys mean, and lists the files that use them.

| Key | Type | Symbol | Used by | Description  
| `i` | number, string | -- | `bsc5p_radec` `bsc5p_3d` `bsc5p_names` `bsc5p_spectral_extra` | Original BSC5P line ID, or 'Custom [n]' if added via the amendments mechanism. Used to link stars between files. |
| `n` | string | -- | `bsc5p_radec` `bsc5p_3d` | A single name given to star. Additional known names for each star stored in [bsc5p_names.json](catalogs/bsc5p_names.json). |
| `p` | number | `pc` | `bsc5p_radec` `bsc5p_3d` | Distance in parsecs, ignoring uncertainty. 1 parsec ≈ 3.26 light-years. |
| `r` | number | `α` | `bsc5p_radec` | Right ascension in **radians**. |
| `d` | number | `δ` | `bsc5p_radec` | Declination in **radians**. |
| `x` | number | -- | `bsc5p_3d` | `x` coordinate approximation in parsecs. |
| `y` | number | -- | `bsc5p_3d` | `y` coordinate approximation in parsecs. |
| `z` | number | -- | `bsc5p_3d` | `z` coordinate approximation in parsecs. |
| `N` | number | `L☉` | `bsc5p_radec` `bsc5p_3d` | Naively calculated luminosity. This does not take dust and other obstruction into account, and can vary several orders of magnitude from real data. This is however still very useful, because being calculated directly from perceived brightness and distance, it gives visualisation software a highly consistent base for realistic-looking 3D calculations. This value may therefore be thought of more as a custom brightness-distance unit than real luminosity. The intended use of this value is generating star size and size falloff based on distance from the software camera (see [Inverse Square Law of Brightness](http://www.astronomy.ohio-state.edu/~pogge/Ast162/Unit1/bright.html)). |
| `K` | vector3 | `K` | `bsc5p_radec` `bsc5p_3d` | Colour of star approximated from star temperature in kelvin (AKA blackbody temperature), converted to RGB. A lot of effort and research has gone into estimating this as physically accurately as humanly possible (while keeping in mind it's still an approximation nonetheless, and will vary by star class and observational quality). |

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

- **Grid Constraints:** Fixed 32 times 32 grid cells per plot (Expandable to 64 times 64 via upgrade).
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

### 6.4 Social & Inspect Features

- **Star Information Drawer:** Clicking an occupied star opens a slide-over modal containing:
  - A graphical ring should show around the star.
  - Star Name and Exact Coordinates $(X, Y, Z)$.
  - Dedication Message & Owner Identifier.
  - Rendered high-res pixel art thumbnail preview.
  - Action buttons: "Copy Direct Link", "Edit Plot" (if owner), "Visit External Website" (Prime Tier).
- **Deep Linking System:** Share URLs structured as `https://starbuilder.app/star?x=120&y=-45` that automatically pan and focus the galaxy map view on the target star.

---

## 7. Data Models & Database Schema

### 7.1 Entity Relationship Diagram (Conceptual)

`users` **1 ─── <** `stars` **1 ─── 1** `plots`

### 7.2 Table Schemas

#### `user`

Refer to the Better Auth docs

#### `stars`

| Field Name               | Type         | Constraints                            | Description               |
| :----------------------- | :----------- | :------------------------------------- | :------------------------ |
| `id`                     | UUID         | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique star identifier    |
| `user_id`                | UUID         | FOREIGN KEY -> users(id)               | Star owner reference      |
| `coord_x`                | INTEGER      | NOT NULL                               | Grid X coordinate         |
| `coord_y`                | INTEGER      | NOT NULL                               | Grid Y coordinate         |
| `coord_z`                | INTEGER      | NOT NULL                               | Grid Z coordinate         |
| `star_name`              | VARCHAR(100) | NOT NULL                               | Custom star title         |
| `dedication_text`        | TEXT         | CHECK (char_length <= 280)             | Custom user dedication    |
| `tier`                   | ENUM         | 'STANDARD', 'CONSTELLATION', 'PRIME'   | Pricing tier category     |
| `status`                 | ENUM         | 'RESERVED', 'CLAIMED'                  | Plot reservation state    |
| `stripe_session_id`      | VARCHAR(255) | NULLABLE                               | Active Stripe checkout ID |
| `stripe_payment_id`      | VARCHAR(255) | NULLABLE                               | Confirmed charge ID       |
| `reservation_expires_at` | TIMESTAMP    | NULLABLE                               | Expiry timestamp for lock |
| `created_at`             | TIMESTAMP    | DEFAULT CURRENT_TIMESTAMP              | Registration timestamp    |

#### `plots`

| Field Name      | Type         | Constraints                            | Description                                           |
| :-------------- | :----------- | :------------------------------------- | :---------------------------------------------------- |
| `id`            | UUID         | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique plot identifier                                |
| `star_id`       | UUID         | FOREIGN KEY -> stars(id), UNIQUE       | Associated star reference                             |
| `width`         | INTEGER      | DEFAULT 32, NOT NULL                   | Grid width in cells                                   |
| `height`        | INTEGER      | DEFAULT 32, NOT NULL                   | Grid height in cells                                  |
| `tile_data`     | JSONB        | NOT NULL                               | Serialized 32x32 matrix encoding tile IDs & rotations |
| `thumbnail_url` | VARCHAR(512) | NULLABLE                               | CDN link to generated preview image                   |
| `updated_at`    | TIMESTAMP    | DEFAULT CURRENT_TIMESTAMP              | Last tile update timestamp                            |

---

## 8. API Endpoint Specifications

### 8.1 Checkout & Payment Endpoints

- `POST /api/checkout/reserve`
  - **Request Body:** `{ coord_x: int, coord_y: int, star_name: string, dedication_text: string }`
  - **Response:** `{ checkout_url: string, expires_at: timestamp }`
  - **Logic:** Checks availability, sets 5-minute Redis lock, creates Stripe Session, returns checkout URL.

- `POST /api/webhooks/stripe`
  - **Headers:** `Stripe-Signature`
  - **Event Handling:** `checkout.session.completed`
  - **Logic:** Validates signature, verifies payment status, updates `stars.status` to `CLAIMED`, provisions empty 32x32 `plots` record, sends confirmation email.

### 8.2 Tile Matrix & Canvas Endpoints

- `GET /api/map/chunks`
  - **Query Params:** `min_x`, `max_x`, `min_y`, `max_y`
  - **Response:** Array of occupied stars and thumbnail URLs within viewport bounds.

- `GET /api/plots/:star_id`
  - **Response:** Full `tile_data` JSON structure and metadata for editor loading.

- `PUT /api/plots/:star_id`
  - **Authentication:** Required (Owner only)
  - **Request Body:** `{ tile_data: JSONB }`
  - **Response:** `{ success: boolean, thumbnail_url: string }`
  - **Logic:** Validates plot payload size, saves matrix to DB, triggers background job to render PNG thumbnail to S3.

---

## 9. Development Milestones & Roadmap

```
Phase 1: Infinite Galaxy Map & Spatial Database (Weeks 4-6)
 ├─ Implement 3D pan/zoom viewport map
 ├─ Set up PostgreSQL database, spatial indexing, and backend APIs
 ├─ Real-time rendering of claimed star plots on main map
 └─ Each star clickable, rendering a ring around the selected star and the name and $(X, Y, Z)$ should be displayed in an overlay in the bottom left.

Phase 2: Core Tile Builder Engine (Weeks 1-3)
 ├─ Build 32x32 canvas grid editor in React/PixiJS
 ├─ Implement draw, erase, eyedropper, and tile palette selector
 └─ Local state serialization testing

Phase 3: Stripe Payments & Lock Engine (Weeks 7-9)
 ├─ Redis coordinate lock mechanism (5-minute expiration)
 ├─ Stripe Checkout integration & Webhook handler implementation
 └─ Account authentication (Clerk/Auth0) and user management

Phase 4: Optimization, CDN Renders & Social Polish (Weeks 10-12)
 ├─ Automated headless/canvas PNG thumbnail generator for S3 upload
 ├─ Deep-linking URL coordinate navigation system
 └─ Sound effects, UI animations, and launch prep
```
