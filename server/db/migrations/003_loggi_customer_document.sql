alter table orders
  add column if not exists customer_document text;
