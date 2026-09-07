-- Run this in your Supabase project's SQL Editor (Dashboard > SQL Editor > New query)

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  order_number text,
  customer text,
  phone text,
  city text,
  date timestamptz not null default now(),
  amount numeric not null default 0,
  status text not null default 'New',
  courier text,
  awb text,
  rto_reason text default '',
  notes text default '',
  shopify_order_id text,
  payment_status text not null default 'Pending', -- Pending, Received, Remitted
  created_at timestamptz default now()
);

-- Row Level Security: each user can only see and edit their own orders
alter table orders enable row level security;

create policy "Users can view their own orders"
  on orders for select
  using (auth.uid() = user_id);

create policy "Users can insert their own orders"
  on orders for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own orders"
  on orders for update
  using (auth.uid() = user_id);

create policy "Users can delete their own orders"
  on orders for delete
  using (auth.uid() = user_id);

-- Helpful index for date-based reporting
create index if not exists orders_date_idx on orders (date);
create index if not exists orders_user_idx on orders (user_id);

-- Prevents the same Shopify order being inserted twice (webhook retries,
-- re-running the historical import, etc). NULLs (manually-added orders)
-- are not affected by uniqueness.
create unique index if not exists orders_shopify_id_unique
  on orders (shopify_order_id)
  where shopify_order_id is not null;

-- Migration for existing tables created before this column was added:
-- alter table orders add column if not exists shopify_order_id text;
-- alter table orders add column if not exists payment_status text not null default 'Pending';

-- ---------------------------------------------------------------------
-- Remittance tracking: what each courier actually paid you back for a
-- COD order, after their deductions (RTO charge, COD collection fee,
-- weight discrepancy, etc). Filled in either manually or via the
-- panel's bulk CSV import (from Shiprocket's Billing > COD Remittance
-- export, or Delhivery One's COD Remittance export).
create table if not exists remittances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  order_id uuid references orders on delete set null,
  order_number text,
  courier text,
  remittance_date timestamptz not null default now(),
  gross_amount numeric not null default 0,
  rto_charge numeric not null default 0,
  cod_charge numeric not null default 0,
  other_deductions numeric not null default 0,
  net_amount numeric not null default 0,
  utr_reference text default '',
  status text not null default 'Pending', -- Pending, Remitted, On Hold
  notes text default '',
  created_at timestamptz default now()
);

alter table remittances enable row level security;

create policy "Users can view their own remittances"
  on remittances for select using (auth.uid() = user_id);
create policy "Users can insert their own remittances"
  on remittances for insert with check (auth.uid() = user_id);
create policy "Users can update their own remittances"
  on remittances for update using (auth.uid() = user_id);
create policy "Users can delete their own remittances"
  on remittances for delete using (auth.uid() = user_id);

create index if not exists remittances_user_idx on remittances (user_id);
create index if not exists remittances_order_number_idx on remittances (order_number);
