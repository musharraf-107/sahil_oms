// Maps a Shopify order status to this panel's status vocabulary.
// Shopify doesn't have a native "RTO" concept, so RTO states are set later,
// either manually, via courier CSV import, or via the fulfillment webhook
// if you tag returned fulfillments in Shopify.
export function mapShopifyStatus(shopifyOrder: any): string {
  if (shopifyOrder.cancelled_at) return "Cancelled";
  const fulfillmentStatus = shopifyOrder.fulfillment_status;
  if (fulfillmentStatus === "fulfilled") return "Shipped";
  if (fulfillmentStatus === null || fulfillmentStatus === "partial") return "Processing";
  return "New";
}

export function shopifyOrderToRow(shopifyOrder: any, userId: string) {
  const address = shopifyOrder.shipping_address || {};
  return {
    order_number: shopifyOrder.name || `#${shopifyOrder.order_number}`,
    customer: [shopifyOrder.customer?.first_name, shopifyOrder.customer?.last_name].filter(Boolean).join(" ") || address.name || "Unknown customer",
    phone: shopifyOrder.phone || address.phone || "",
    city: address.city || "",
    date: shopifyOrder.created_at || new Date().toISOString(),
    amount: parseFloat(shopifyOrder.total_price || "0"),
    status: mapShopifyStatus(shopifyOrder),
    courier: shopifyOrder.shipping_lines?.[0]?.title || "Own Delivery Team",
    awb: shopifyOrder.fulfillments?.[0]?.tracking_number || "",
    rto_reason: "",
    notes: `Shopify order ${shopifyOrder.id}`,
    shopify_order_id: String(shopifyOrder.id),
    user_id: userId,
  };
}
