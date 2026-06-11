alter table products add column if not exists title text;
alter table products add column if not exists description_html text;
alter table products add column if not exists description_text text;
alter table products add column if not exists stock integer;
alter table products add column if not exists availability text;
alter table products add column if not exists primary_image_url text;
alter table products add column if not exists specifications jsonb not null default '{}'::jsonb;
alter table products add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table products add column if not exists is_active boolean not null default true;
alter table products add column if not exists source_platform text not null default 'admin';

create index if not exists products_section_brand_slug_idx on products(lower(coalesce(section, '')), lower(coalesce(brand, '')), lower(slug));
create index if not exists products_is_active_idx on products(is_active);
