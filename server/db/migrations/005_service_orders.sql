create table if not exists service_orders (
  id text primary key,
  os_number bigserial unique,
  order_id text references orders(id) on delete set null,
  status text not null default 'aberta',
  customer_name text not null,
  customer_phone text,
  customer_document text,
  customer_address text,
  customer_email text,
  device_brand text,
  device_model text,
  device_color text,
  device_serial text,
  device_password text,
  intake_condition text,
  reported_issue text,
  diagnosis text,
  services_done text,
  labor_cents integer not null default 0,
  technician text,
  internal_notes text,
  customer_notes text,
  product_total_cents integer not null default 0,
  discount_cents integer not null default 0,
  total_cents integer not null default 0,
  payment_method text,
  payment_status text not null default 'pendente',
  warranty_days integer not null default 90,
  warranty_terms text,
  warranty_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists service_orders_status_idx on service_orders(status);
create index if not exists service_orders_order_idx on service_orders(order_id);
create index if not exists service_orders_created_idx on service_orders(created_at desc);
create index if not exists service_orders_customer_phone_idx on service_orders(customer_phone);

create table if not exists service_order_items (
  id bigserial primary key,
  service_order_id text not null references service_orders(id) on delete cascade,
  product_id text references products(id) on delete set null,
  product_name text not null,
  qty integer not null default 1,
  unit_price_cents integer not null default 0,
  line_total_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists service_order_items_order_idx on service_order_items(service_order_id);
