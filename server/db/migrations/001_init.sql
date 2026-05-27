create table if not exists products (
  id text primary key,
  slug text not null,
  name text not null,
  brand text,
  section text,
  price_cents integer not null,
  currency text not null default 'BRL',
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_active_idx on products(active);
create index if not exists products_created_idx on products(created_at desc);

create table if not exists carts (
  id text primary key,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists carts_status_idx on carts(status);

create table if not exists cart_items (
  cart_id text not null references carts(id) on delete cascade,
  product_id text not null references products(id),
  qty integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (cart_id, product_id)
);

create table if not exists orders (
  id text primary key,
  status text not null,
  currency text not null default 'BRL',
  total_cents integer not null default 0,
  cart_id text references carts(id),
  mp_preference_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_created_idx on orders(created_at desc);
create index if not exists orders_mp_pref_idx on orders(mp_preference_id);

create table if not exists order_items (
  id bigserial primary key,
  order_id text not null references orders(id) on delete cascade,
  product_id text not null references products(id),
  qty integer not null,
  unit_price_cents integer not null,
  line_total_cents integer not null,
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on order_items(order_id);

create table if not exists payments (
  id bigserial primary key,
  provider text not null,
  provider_payment_id text not null,
  order_id text references orders(id),
  status text not null,
  amount_cents integer not null default 0,
  currency text not null default 'BRL',
  raw_json jsonb,
  created_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);
create index if not exists payments_order_idx on payments(order_id);

create table if not exists webhook_events (
  id bigserial primary key,
  provider text not null,
  dedupe_key text not null,
  request_id text,
  signature text,
  raw_body text,
  parsed_json jsonb,
  created_at timestamptz not null default now(),
  unique(provider, dedupe_key)
);
create index if not exists webhook_events_provider_idx on webhook_events(provider);

