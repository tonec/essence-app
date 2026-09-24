-- Extends 00000000000000_schema.sql with:
--   1. stars.dedication_text  (280-char user dedication captured at reserve time)
--   2. public.plots           (per-star 32x32 or 64x64 tile matrix + thumbnail)
--   3. public.stripe_events   (Stripe webhook idempotency ledger)

alter table public.stars
  add column dedication_text text
    check (dedication_text is null or char_length(dedication_text) <= 280);

comment on column public.stars.dedication_text is
  'Optional 280-character dedication captured at reserve time. Displayed in the star info drawer.';

create table public.plots (
  id bigint generated always as identity primary key,
  star_id integer not null unique references public.stars (id) on delete cascade,
  expanded boolean not null default false,
  tile_data jsonb not null default '[]'::jsonb,
  thumbnail_url text default null,
  updated_at timestamptz not null default now()
);

comment on table public.plots is
  'One pixel-art plot per claimed star. expanded=true means a 64x64 Mega-Plot; otherwise 32x32.';

alter table public.plots enable row level security;

create policy "Allow public read access"
  on public.plots for select to public
  using (true);

create policy "Owners can update their plot"
  on public.plots for update to authenticated
  using (
    exists (
      select 1 from public.stars
      where stars.id = plots.star_id and stars.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.stars
      where stars.id = plots.star_id and stars.user_id = (select auth.uid())
    )
  );

create table public.stripe_events (
  event_id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

comment on table public.stripe_events is
  'Idempotency ledger for Stripe webhook deliveries. Insert-then-process; duplicates are no-ops.';

alter table public.stripe_events enable row level security;
-- No policies: this table is only touched by the webhook route using the service role key.
