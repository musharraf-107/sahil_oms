// Delhivery tracking API (api.delhivery.com). Auth is a static API token
// from your Delhivery One account (Developer Portal), sent as a Token
// header — no login/session step needed.
// As with Shiprocket, COD remittance is dashboard-only (Delhivery One >
// COD Remittance) — no public API for it. Use CSV export + bulk import.

export function mapDelhiveryStatus(status: string): string | null {
  const s = (status || "").toLowerCase();
  if (s.includes("delivered") && s.includes("rto")) return "RTO Delivered";
  if (s.includes("delivered")) return "Delivered";
  if (s.includes("rto") && (s.includes("transit") || s.includes("intransit"))) return "RTO In-Transit";
  if (s.includes("rto")) return "RTO Initiated";
  if (s.includes("out for delivery") || s.includes("dispatched")) return "Out for Delivery";
  if (s.includes("in transit") || s.includes("picked up") || s.includes("manifested")) return "Shipped";
  if (s.includes("cancel")) return "Cancelled";
  return null;
}

export async function trackDelhiveryByWaybill(waybill: string) {
  const token = process.env.DELHIVERY_API_TOKEN;
  if (!token) throw new Error("DELHIVERY_API_TOKEN not configured");

  const url = `https://track.delhivery.com/api/v1/packages/json/?waybill=${encodeURIComponent(waybill)}&verbose=2`;
  const res = await fetch(url, { headers: { Authorization: `Token ${token}` } });
  if (!res.ok) throw new Error(`Delhivery track failed for ${waybill}: ${await res.text()}`);
  const data = await res.json();
  const status: string = data?.ShipmentData?.[0]?.Shipment?.Status?.Status || "";
  return { rawStatus: status, mappedStatus: mapDelhiveryStatus(status) };
}
