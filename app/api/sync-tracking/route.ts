import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { trackShiprocketByAwb } from "@/lib/shiprocket";
import { trackDelhiveryByWaybill } from "@/lib/delhivery";

const FINAL_STATUSES = ["Delivered", "RTO Delivered", "Cancelled"];

export async function POST() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Only orders with an AWB, a recognized courier, and a non-final status
  // are worth checking — no point re-pinging orders already delivered.
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, awb, courier, status")
    .in("courier", ["Shiprocket", "Delhivery"])
    .not("awb", "is", null)
    .not("status", "in", `(${FINAL_STATUSES.map((s) => `"${s}"`).join(",")})`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0, checked = 0, failed = 0;
  for (const order of orders || []) {
    if (!order.awb) continue;
    checked++;
    try {
      const result = order.courier === "Shiprocket"
        ? await trackShiprocketByAwb(order.awb)
        : await trackDelhiveryByWaybill(order.awb);

      if (result.mappedStatus && result.mappedStatus !== order.status) {
        const { error: updateErr } = await supabase
          .from("orders")
          .update({ status: result.mappedStatus })
          .eq("id", order.id);
        if (!updateErr) updated++;
      }
    } catch (e) {
      failed++;
      console.error(`Tracking sync failed for order ${order.id}:`, e);
    }
  }

  return NextResponse.json({ checked, updated, failed });
}
