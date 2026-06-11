create table if not exists provider_oauth_tokens (
  provider text primary key,
  access_token text not null,
  refresh_token text,
  token_type text,
  scope text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provider_oauth_tokens_expires_idx on provider_oauth_tokens(provider, expires_at);
