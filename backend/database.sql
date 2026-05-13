-- ============================================================
-- TECH 7 — Full Database Schema for Supabase/PostgreSQL
-- ============================================================
-- Run this file directly in the Supabase SQL Editor
-- or via: psql $DATABASE_URL -f database.sql
-- ============================================================

-- Enable UUID generation
create extension if not exists pgcrypto;

-- ============================================================
-- 1. PRODUCTS
-- ============================================================
create table if not exists products (
  id          text primary key,
  slug        text not null unique,
  name        text not null,
  description text,
  price       numeric(10,2) not null default 0,
  old_price   numeric(10,2),
  stock       integer not null default 0,
  image_url   text,
  category    text,
  brand       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists products_active_idx on products(active);
create index if not exists products_category_idx on products(category);
create index if not exists products_brand_idx on products(brand);
create index if not exists products_created_idx on products(created_at desc);

-- ============================================================
-- 2. CUSTOMERS
-- ============================================================
create table if not exists customers (
  id         text primary key,
  name       text not null,
  email      text not null,
  phone      text,
  document   text,
  created_at timestamptz not null default now()
);

create unique index if not exists customers_email_idx on customers(lower(email));

-- ============================================================
-- 3. ORDERS
-- ============================================================
create table if not exists orders (
  id                 text primary key,
  customer_id        text references customers(id),
  customer_name      text not null,
  customer_email     text not null,
  customer_phone     text,
  customer_document  text,
  shipping_zipcode   text,
  shipping_address   text,
  shipping_number    text,
  shipping_complement text,
  shipping_neighborhood text,
  shipping_city      text,
  shipping_state     text,
  subtotal           numeric(10,2) not null default 0,
  shipping_total     numeric(10,2) not null default 0,
  discount_total     numeric(10,2) not null default 0,
  total              numeric(10,2) not null default 0,
  status             text not null default 'pending',
  payment_status     text default 'pending',
  payment_provider   text,
  payment_id         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists orders_status_idx on orders(status);
create index if not exists orders_customer_idx on orders(customer_email);
create index if not exists orders_created_idx on orders(created_at desc);

-- ============================================================
-- 4. ORDER ITEMS
-- ============================================================
create table if not exists order_items (
  id           bigserial primary key,
  order_id     text not null references orders(id) on delete cascade,
  product_id   text not null,
  product_name text not null,
  quantity     integer not null,
  unit_price   numeric(10,2) not null,
  total_price  numeric(10,2) not null,
  created_at   timestamptz not null default now()
);

create index if not exists order_items_order_idx on order_items(order_id);

-- ============================================================
-- 5. ADMIN USERS
-- ============================================================
create table if not exists admin_users (
  id            text primary key,
  email         text not null unique,
  password_hash text not null,
  name          text not null,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- SEED: default admin + demo product
-- ============================================================
-- Admin password: tech7admin2024 (bcrypt hash)
insert into admin_users (id, email, password_hash, name)
values (
  'admin-001',
  'admin@tech7.com.br',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'Admin TECH 7'
)
on conflict (email) do nothing;

-- Demo product
insert into products (id, slug, name, description, price, stock, category, brand, active)
values (
  '7077',
  'tela-display-lcd-realme-c55-rmx3710-com-aro',
  'Tela Display Lcd Realme C55 RMX3710 Com Aro',
  'Tela LCD original com aro para Realme C55 RMX3710. Pronta entrega.',
  95.00,
  10,
  'DISPLAY',
  'Realme',
  true
)
on conflict (id) do nothing;
