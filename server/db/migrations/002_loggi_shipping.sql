alter table orders
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists delivery_mode text not null default 'shipping',
  add column if not exists subtotal_cents integer not null default 0,
  add column if not exists shipping_total_cents integer not null default 0,
  add column if not exists shipping_provider text,
  add column if not exists shipping_quote_id text,
  add column if not exists shipping_service_id text,
  add column if not exists shipping_service_label text,
  add column if not exists shipping_slo_days integer,
  add column if not exists shipping_zipcode text,
  add column if not exists shipping_address text,
  add column if not exists shipping_number text,
  add column if not exists shipping_complement text,
  add column if not exists shipping_neighborhood text,
  add column if not exists shipping_city text,
  add column if not exists shipping_state text;

update orders
set subtotal_cents = total_cents
where subtotal_cents = 0 and total_cents > 0;

create table if not exists shipping_quotes (
  id text primary key,
  provider text not null,
  status text not null default 'active',
  currency text not null default 'BRL',
  subtotal_cents integer not null default 0,
  destination_json jsonb not null default '{}'::jsonb,
  packages_json jsonb not null default '[]'::jsonb,
  options_json jsonb not null default '[]'::jsonb,
  selected_service_id text,
  selected_price_cents integer,
  selected_label text,
  raw_json jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists shipping_quotes_status_idx on shipping_quotes(status, expires_at);

create table if not exists shipments (
  id bigserial primary key,
  order_id text not null references orders(id) on delete cascade,
  provider text not null,
  status text not null default 'pending',
  external_service_id text,
  loggi_key text,
  tracking_code text,
  barcode text,
  sequence text,
  label_url text,
  label_base64 text,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, order_id),
  unique(provider, loggi_key),
  unique(provider, tracking_code)
);
create index if not exists shipments_order_idx on shipments(order_id);
create index if not exists shipments_tracking_idx on shipments(provider, tracking_code);

create table if not exists shipment_events (
  id bigserial primary key,
  provider text not null,
  dedupe_key text not null,
  order_id text references orders(id),
  loggi_key text,
  tracking_code text,
  status_code text,
  status_label text,
  status_description text,
  action_required jsonb,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  unique(provider, dedupe_key)
);
create index if not exists shipment_events_order_idx on shipment_events(order_id);
create index if not exists shipment_events_tracking_idx on shipment_events(provider, tracking_code);
