# Manifest — Order & RTO Console (web version)

Order intake, RTO tracking, delivery-team performance, bulk import, real
Shopify sync, and Excel exports — with login, a database, and installable
as an app on your phone (PWA).

Stack: **Next.js 14** (Vercel) + **Supabase** (auth + Postgres).

---

## ⚡ Do these first (in this order)

**If you already set up Supabase earlier:** skip to **"Updating an existing
Supabase project"** right below — you don't need to redo Section 1, just
run one small migration snippet.

1. **Supabase project + schema** — Section 1 below. Everything else depends on this.
2. **Sign up once** in the app (locally or after deploying) so you have a
   user account — you'll need your own user UUID for the Shopify vars.
3. **Shopify custom app** — Section 4 below. This is the piece that lets
   Shopify actually talk to your panel.
4. **Deploy to Vercel** — Section 3. Add all env vars at once, deploy.
5. **Point Shopify's webhook** at your live Vercel URL — last step in Section 4.

Everything below fills in the details for each of those steps.

---

## Updating an existing Supabase project

If you already ran an earlier version of `schema.sql`, just run this in
**SQL Editor → New query** to add the new bits (payment status + the
remittance table) without touching your existing orders:

```sql
alter table orders add column if not exists payment_status text not null default 'Pending';

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
  status text not null default 'Pending',
  notes text default '',
  created_at timestamptz default now()
);

alter table remittances enable row level security;

create policy "Users can view their own remittances" on remittances for select using (auth.uid() = user_id);
create policy "Users can insert their own remittances" on remittances for insert with check (auth.uid() = user_id);
create policy "Users can update their own remittances" on remittances for update using (auth.uid() = user_id);
create policy "Users can delete their own remittances" on remittances for delete using (auth.uid() = user_id);

create index if not exists remittances_user_idx on remittances (user_id);
create index if not exists remittances_order_number_idx on remittances (order_number);
```

Then just re-upload the updated code (Section 3) and redeploy — no need to
touch Supabase again after this.

---

## 1. Create your Supabase project (5 min)

1. https://supabase.com → **New project** (free tier is fine).
2. **SQL Editor → New query** → paste in `schema.sql` → **Run**.
   This creates the `orders` table with row-level security, so each user
   only sees their own data.
3. **Project Settings → API** — copy:
   - **Project URL**
   - **anon public** key
   - **service_role** key (keep this one secret — server-only, never in the browser)
4. **Authentication → Providers** — Email should already be on.

---

## 2. Run it locally (optional, to test before deploying)

```bash
npm install
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY at minimum
npm run dev
```

Open http://localhost:3000, **Create account**, then sign in. Once signed
in, go to **Supabase → Authentication → Users**, find your account, and
copy your **User UID** — you'll need it for `SHOPIFY_TARGET_USER_ID` below.

---

## 3. Deploy to Vercel (free)

1. Push this folder to a GitHub repo.
2. https://vercel.com → **Add New → Project** → import the repo.
3. Add **all** the environment variables from `.env.local.example` under
   the project's **Environment Variables** settings (fill in real values —
   see Section 4 for the Shopify ones).
4. **Deploy.** You'll get a live URL like `manifest-oms.vercel.app`.

---

## 4. Connecting Shopify

This gives you two things: a **live webhook** (new/updated orders appear
instantly) and a **manual sync button** (pulls your recent order history
once, from the Import & Sync tab).

**A. Create a custom app in Shopify:**
1. Shopify admin → **Settings → Apps and sales channels → Develop apps**.
2. **Create an app** → name it (e.g. "Manifest OMS").
3. **Configuration → Admin API scopes** → enable `read_orders` (and
   `read_fulfillments` if you want tracking numbers pulled in).
4. **API credentials** tab → **Install app** → copy the **Admin API access
   token** (starts with `shpat_`). This is your `SHOPIFY_ADMIN_API_TOKEN`.
5. Your `SHOPIFY_STORE_DOMAIN` is `your-store.myshopify.com` (no `https://`).

**B. Set up the webhook (for real-time order sync):**
1. Same custom app → **Configuration → Webhooks** (or Settings →
   Notifications → Webhooks in older admin layouts).
2. Add a webhook for **Order creation**, format JSON, URL:
   `https://your-vercel-url.vercel.app/api/shopify-webhook`
3. Shopify will show you a **signing secret** the first time — that's your
   `SHOPIFY_WEBHOOK_SECRET`. (If it's not shown, Shopify uses your app's
   API secret key from the API credentials tab instead — use that.)
4. Repeat for **Order updated** if you want status/fulfillment changes to sync too.

**C. Add the remaining env vars to Vercel** and redeploy:
- `SUPABASE_SERVICE_ROLE_KEY`
- `SHOPIFY_TARGET_USER_ID` (your Supabase user UUID from Section 2)
- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_ADMIN_API_TOKEN`
- `SHOPIFY_WEBHOOK_SECRET`

Once deployed, go to **Import & Sync → Sync now** for a one-time pull of
your recent order history, then new orders will flow in automatically via
the webhook.

---

## 5. Bulk import (CSV / Excel)

Go to **Import & Sync → Bulk import**, upload a `.csv` or `.xlsx` file.

- Rows are matched to existing orders by **Order #** or **AWB / tracking
  number** — matched rows get their status, RTO reason, courier, AWB, or
  notes **overwritten** with whatever's in the sheet.
- Unmatched rows are added as brand-new orders.
- Column names are flexible — headers like "Order Number", "AWB",
  "Tracking No", "Status", "Return Reason", "Courier" are all recognized
  automatically, so you can upload a courier's return-status sheet
  more or less as-is.
- You'll see a preview before anything is applied.

---

## 6. Live courier tracking (Shiprocket & Delhivery)

**Important limitation to know up front:** neither Shiprocket nor Delhivery
expose COD remittance/payment data through a public API — that's only
visible in their dashboards. What their APIs *do* expose is shipment
tracking (current status, delivered/RTO/in-transit), and that's what's
wired in here.

**Get your credentials:**
- **Shiprocket:** just your normal seller-panel email + password (used to
  generate a tracking token automatically — Shiprocket doesn't require a
  separate API user for the tracking endpoint).
- **Delhivery:** log into **Delhivery One → Developer Portal** and copy
  your API token.

**Add to Vercel:**
- `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`
- `DELHIVERY_API_TOKEN`

Then in the panel, go to **Import & Sync → Refresh tracking**. This checks
every order assigned to Shiprocket or Delhivery that isn't already
Delivered/RTO Delivered/Cancelled, and updates its status from what the
courier reports. Run it whenever you want fresh statuses — there's no
background job, it runs on demand.

---

## 7. Remittance tracking

The **Remittance** tab tracks what a courier actually paid you for COD
orders, after their deductions — RTO charge, COD collection fee, any other
penalty — so "amount collected" and "amount you actually received" don't
get confused.

- **Add manually** for one-off entries.
- **Bulk import**: export the COD Remittance report from Shiprocket
  (Billing → COD Remittance) or Delhivery One (COD Remittance section) as
  CSV/Excel, and upload it in the Remittance tab. Rows are matched to
  orders by Order # or AWB; gross amount, RTO charge, COD charge, other
  deductions, and UTR reference are picked up automatically from common
  column names.
- Net amount is calculated automatically (gross − RTO charge − COD charge
  − other deductions).
- Once a remittance is recorded against an order, that order's payment
  status is set to "Remitted" and you'll see the full breakdown in that
  order's detail view (click any order number to open it).

---

## 8. Voice commands

Click the 🎙 **Voice command** button in the sidebar and say things like:
- "Show today's orders"
- "Open RTO tracker" / "Show returns"
- "Show delivery team"
- "Open remittance" / "Show payments"
- "Add order" / "New order"
- "Show reports"

This uses your browser's built-in speech recognition (Web Speech API) —
works in Chrome on desktop and Android. Safari/iOS support is limited, so
if it doesn't respond there, that's a browser limitation, not a bug.

---

## 9. Installing it as an app on your phone

This is a **Progressive Web App** — no app store needed:

- **Android (Chrome):** open your Vercel URL → menu (⋮) → **Add to Home
  screen** / **Install app**.
- **iPhone (Safari):** open your Vercel URL → Share button → **Add to
  Home Screen**.

It'll appear as a normal app icon and open full-screen, no browser bar.

---

## 10. Adding teammates later

Right now each account only sees its own orders. If you want a shared team
inbox instead, or want to close public sign-up and invite people manually,
just ask — both are small changes.

---

## What's in this folder

```
app/
  login/page.tsx                 → sign in / sign up
  dashboard/page.tsx             → dashboard, orders, RTO, remittance, delivery, import, reports
  api/shopify-webhook/route.ts   → receives live Shopify order events
  api/shopify-import/route.ts    → manual "sync now" historical pull
  api/sync-tracking/route.ts     → refreshes order status from Shiprocket/Delhivery
lib/
  supabase/                      → browser + server Supabase clients
  supabase-admin.ts              → service-role client (server-only, for webhooks/import)
  shopify.ts, shiprocket.ts, delhivery.ts → courier/platform integration helpers
public/
  manifest.json, sw.js, icons    → makes the app installable on a phone
middleware.ts                    → protects /dashboard, redirects logged-out users
schema.sql                       → run once in Supabase's SQL editor
.env.local.example               → copy to .env.local and fill in your keys
```
#   s a h i l _ o m s  
 