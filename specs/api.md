# API Endpoint Specifications

## Checkout & Payment Endpoints

- `POST /api/checkout/reserve`
  - **Request Body:** `{ catalog_id: number, star_name: string, dedication_text: string, mega_plot?: boolean }`
  - **Response:** `{ checkout_url: string, expires_at: timestamp }` (409 on conflict)
  - **Logic:** Looks up `catalog_id` in the in-memory catalog, derives `tier` from `b`, `INSERT`s a `stars` row with `status='RESERVED'` and `reservation_expires_at = now() + 5 minutes`. On `unique_violation`, returns 409 (star is already reserved or claimed). Creates a Stripe Session with the metadata above; returns checkout URL.

- `POST /api/webhooks/stripe`
  - **Headers:** `Stripe-Signature`
  - **Event Handling:** `checkout.session.completed`, `checkout.session.expired`
  - **Logic:** Reads raw request body via `await req.text()`, verifies signature, dedupes against `stripe_events`, then: on `completed` `UPDATE`s `stars.status = 'CLAIMED'` + inserts `plots` row; on `expired` `DELETE`s the `RESERVED` row. Sends confirmation email on `completed`.

- Scheduled sweep (pg_cron, every minute): `DELETE FROM stars WHERE status = 'RESERVED' AND reservation_expires_at < now()`.

## Star & Plot Endpoints

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

