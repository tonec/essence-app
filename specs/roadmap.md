## Development Milestones & Roadmap

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
