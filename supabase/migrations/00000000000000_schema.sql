create type tier as enum (
  'STANDARD',
  'PRIME'
);

create type star_status as enum (
  'AVAILABLE',
  'RESERVED',
  'CLAIMED'
);

create table public.stars (
  id integer primary key,
  user_id uuid references auth.users (id) default null,
  coord_x integer not null,
  coord_y integer not null,
  star_name text not null,
  tier tier not null default 'STANDARD'::tier,
  status star_status not null default 'AVAILABLE'::star_status,
  reservation_expires_at timestamptz default null,
  stripe_session_id text default null,
  stripe_payment_id text default null,
  created_at timestamptz default now() not null
);

alter table public.stars enable row level security;

create policy "Allow public read access"
  on public.stars for select to public
  using (true);