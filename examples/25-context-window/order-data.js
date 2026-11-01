// Invented order-system responses. A real lookup returns far more than a refund needs, which is the
// point of the trimming step. The two orders and the return are the known values every check compares against.

const baseOrder = {
  warehouse_id: "WH-LEEDS-02", warehouse_zone: "C4", picker_id: "P-2291", packer_id: "P-1187",
  carrier: "NorthParcel", carrier_service: "standard-48", carrier_account: "NP-778120",
  tracking_number: "NP778120449GB", tracking_url: "https://track.example.com/NP778120449GB",
  tracking_history: [
    { at: "2024-03-04T08:12:00Z", event: "Collected from warehouse" },
    { at: "2024-03-05T06:40:00Z", event: "At regional sorting centre" },
    { at: "2024-03-06T13:02:00Z", event: "Delivered, signed for by neighbour" },
  ],
  shipping_address_line1: "12 Wharf Street", shipping_address_city: "Leeds", shipping_postcode: "LS1 4AB",
  billing_address_line1: "12 Wharf Street", billing_address_city: "Leeds", billing_postcode: "LS1 4AB",
  payment_provider: "CardStream", payment_token: "tok_9f2c1d77ab", payment_auth_code: "AUTH-44120",
  fraud_score: 0.03, fraud_review_required: false, currency: "USD", tax_code: "STD-20", promo_code: null,
  loyalty_points_earned: 248, loyalty_tier_at_purchase: "silver", channel: "web", device_type: "mobile",
  session_id: "sess_71ac03e9", referrer: "https://search.example.com/blenders", ab_test_bucket: "checkout-v3-b",
  gift_wrap: false, gift_message: null, invoice_pdf_url: "https://docs.example.com/inv/8891.pdf",
  erp_sync_status: "synced", erp_sync_at: "2024-03-03T22:10:04Z", crm_case_count: 0,
  agent_notes: "Customer asked in chat whether the jug is dishwasher safe. Told yes, top rack only. Friendly conversation.",
  marketing_copy: "Our quietest blender yet, with a twelve-speed dial and a jug that survives daily use.",
};

export const RAW_ORDERS = {
  8891: {
    ...baseOrder,
    order_id: "#8891", customer_id: "C-4471", order_date: "2024-03-03", total_amount: 247.83, status: "delivered",
    return_eligible: true, item_description: "Aurora X2 blender",
  },
  8917: {
    ...baseOrder,
    order_id: "#8917", customer_id: "C-4471", order_date: "2024-03-19", total_amount: 64.19, status: "delivered",
    return_eligible: true, item_description: "Replacement jug for Aurora X2",
    tracking_number: "NP778120991GB", tracking_url: "https://track.example.com/NP778120991GB",
    invoice_pdf_url: "https://docs.example.com/inv/8917.pdf",
  },
};

export const RAW_RETURN = {
  order_id: "#8891", rma_id: "RMA-55210", restocking_fee: 12.5, net_refund: 235.33, refund_due_date: "2024-03-29",
  return_label_url: "https://docs.example.com/rma/55210.pdf", drop_off_network: "ParcelPoint",
  drop_off_deadline: "2024-03-25", carrier_account: "NP-778120", return_warehouse: "WH-LEEDS-02",
  inspection_required: true, internal_reason_code: "DEF-14",
  agent_notes: "Standard defect flow. Customer polite. Offer goodwill voucher only if asked.",
};

export const lookupOrder = (id) => RAW_ORDERS[String(id).replace(/\D/g, "")] ?? null;
