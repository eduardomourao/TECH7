create table if not exists coupons (
  id text primary key,
  code text not null,
  discount_cents integer not null default 0,
  expires_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_discount_positive check (discount_cents > 0)
);

create unique index if not exists coupons_code_lower_uidx on coupons (lower(code));
create index if not exists coupons_active_expires_idx on coupons (active, expires_at);

alter table orders add column if not exists discount_cents integer not null default 0;
alter table orders add column if not exists coupon_id text;
alter table orders add column if not exists coupon_code text;
alter table orders add column if not exists coupon_discount_cents integer not null default 0;

create index if not exists orders_coupon_code_idx on orders (lower(coalesce(coupon_code, '')));
