// Shiprocket External API (documented at apidocs.shiprocket.in).
// Auth: email+password → Bearer token (valid ~240 hours).
// There is NO documented public endpoint for COD remittance data —
// that's dashboard-only (Billing > COD Remittance). Use CSV export +
// the panel's bulk import for remittance instead.

const SHIPROCKET_BASE = "https://apiv2.shiprocket.in/v1/external";

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getShiprocketToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || !password) throw new Error("SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD not configured");

  const res = await fetch(`${SHIPROCKET_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Shiprocket auth failed: ${await res.text()}`);
  const data = await res.json();
  // Token is valid for 240 hours; cache for 230 to be safe.
  cachedToken = { token: data.token, expiresAt: Date.now() + 230 * 60 * 60 * 1000 };
  return data.token;
}

// Maps Shiprocket's shipment status strings to this panel's vocabulary.
export function mapShiprocketStatus(status: string): string | null {
  const s = (status || "").toLowerCase();
  if (s.includes("delivered")) return "Delivered";
  if (s.includes("rto delivered")) return "RTO Delivered";
  if (s.includes("rto") && (s.includes("transit") || s.includes("initiated") || s.includes("intransit"))) return "RTO In-Transit";
  if (s.includes("rto")) return "RTO Initiated";
  if (s.includes("out for delivery")) return "Out for Delivery";
  if (s.includes("in transit") || s.includes("shipped") || s.includes("picked")) return "Shipped";
  if (s.includes("cancel")) return "Cancelled";
  return null; // unrecognized — leave existing status untouched
}

export async function trackShiprocketByAwb(awb: string) {
  const token = await getShiprocketToken();
  const res = await fetch(`${SHIPROCKET_BASE}/courier/track/awb/${encodeURIComponent(awb)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Shiprocket track failed for ${awb}: ${await res.text()}`);
  const data = await res.json();
  const trackData = data?.tracking_data;
  const currentStatus: string = trackData?.shipment_track?.[0]?.current_status || trackData?.shipment_status || "";
  return { rawStatus: currentStatus, mappedStatus: mapShiprocketStatus(currentStatus) };
}
