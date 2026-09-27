# Pricing (draft)

## Business Model & Stripe Pricing Architecture

The application uses a **brightness-tiered pricing model**: the visually brightest stars (the ones humans actually recognize — Sirius, Vega, Betelgeuse, etc.) are premium; everything else is standard.

### Coordinate Pricing Tiers

Tier is derived from apparent magnitude `b` in `bsc5p_spectral_extra.json` (lower `b` = brighter). Threshold picked from the BSC5P distribution: `b < 3.0` captures the top ~175 stars (~1.9% of catalog) — approximately the "named naked-eye" set.

| Tier Name                        | Price (One-Time) | Selection Criteria                                       | Features & Entitlements                                                                                                                   |
| :------------------------------- | :--------------- | :------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| **Standard**                     | **$4.99 USD**    | `b ≥ 3.0` (~8,926 stars — majority of catalog)           | $32 \times 32$ Construction Plot. Basic Tile Palette (16 standard terrain/metal tiles). 280-character dedication.                         |
| **Prime**                        | **$49.99 USD**   | `b < 3.0` (~175 stars — visually prominent, often named) | $32 \times 32$ Construction Plot. VIP Tile Palette (Gold, Holographic, Obsidian tiles). External link / social-handle embed on info card. |
| **Mega-Plot Expansion (Upsell)** | **+$9.99 USD**   | Checkout add-on line item (either tier)                  | Expands grid bounds from $32 \times 32$ to $64 \times 64$ tiles. Stored as `plots.expanded = true`.                                       |

### Stripe Checkout & Plot Reservation Workflow

Race-condition prevention piggybacks on the `stars.id` unique constraint: `id` is the BSC5P catalog key, so an `INSERT` from a second buyer for the same star conflicts and fails. Redis is not required for reservation atomicity.

1. **Selection:** User selects a vacant catalog star (identified by its BSC5P `i` key).
2. **Reserve:** `POST /api/checkout/reserve` runs `INSERT INTO stars (id, ..., status='RESERVED', reservation_expires_at = now() + interval '5 minutes')`. On conflict, returns 409.
3. **Checkout Creation:** Backend initializes a Stripe Checkout Session with metadata: `catalog_id`, `star_name`, `dedication_text`, `user_id`, `tier`, and optional `mega_plot` flag.
4. **Payment Fulfillment:**
   - **On Success:** Stripe fires `checkout.session.completed`. Backend `UPDATE stars SET status='CLAIMED', stripe_payment_id=... WHERE id=$1 AND status='RESERVED'`, provisions the `plots` row, and emails confirmation.
   - **On Expiry/Cancel:** `checkout.session.expired` fires OR a scheduled sweep runs `DELETE FROM stars WHERE status='RESERVED' AND reservation_expires_at < now()`.