import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase-admin";
import { shopifyOrderToRow } from "@/lib/shopify";

// Shopify sends the raw request body signed with your webhook secret.
// We must verify it BEFORE trusting the payload, and must read the body
// as raw text (not JSON) so the signature check matches byte-for-byte.
function verifyShopifyWebhook(rawBody: string, hmacHeader: string | null): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret || !hmacHeader) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false; // length mismatch etc.
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");

  if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const targetUserId = process.env.SHOPIFY_TARGET_USER_ID;
  if (!targetUserId) {
    return NextResponse.json({ error: "SHOPIFY_TARGET_USER_ID is not configured" }, { status: 500 });
  }

  const shopifyOrder = JSON.parse(rawBody);
  const row = shopifyOrderToRow(shopifyOrder, targetUserId);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("orders")
    .upsert(row, { onConflict: "shopify_order_id" });

  if (error) {
    console.error("Shopify webhook upsert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
