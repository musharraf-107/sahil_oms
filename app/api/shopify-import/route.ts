import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { shopifyOrderToRow } from "@/lib/shopify";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

// Pulls the most recent orders from Shopify's Admin API and upserts them.
// Triggered from the Import tab in the panel — requires the signed-in user
// to be the configured SHOPIFY_TARGET_USER_ID (so a stranger can't trigger
// your store's import even if they guess the endpoint).
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const targetUserId = process.env.SHOPIFY_TARGET_USER_ID;
  if (!targetUserId || user.id !== targetUserId) {
    return NextResponse.json({ error: "This account is not authorized to run the Shopify import" }, { status: 403 });
  }

  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!storeDomain || !accessToken) {
    return NextResponse.json({ error: "SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN not configured" }, { status: 500 });
  }

  const url = `https://${storeDomain}/admin/api/2024-10/orders.json?status=any&limit=250`;
  const shopifyRes = await fetch(url, {
    headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
  });

  if (!shopifyRes.ok) {
    const text = await shopifyRes.text();
    return NextResponse.json({ error: `Shopify API error: ${text}` }, { status: 502 });
  }

  const { orders: shopifyOrders } = await shopifyRes.json();
  const rows = (shopifyOrders || []).map((o: any) => shopifyOrderToRow(o, targetUserId));

  if (rows.length === 0) {
    return NextResponse.json({ imported: 0 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("orders").upsert(rows, { onConflict: "shopify_order_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ imported: rows.length });
}
