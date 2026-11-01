// An invented database schema for catalogue and exploration examples.

export const SHOP_SCHEMA = {
  tables: [
    { name: "customers", description: "Customer accounts", columns: { id: "uuid", email: "text", name: "text", loyalty_tier: "text" } },
    { name: "orders", description: "Placed orders", columns: { id: "uuid", customer_id: "uuid references customers", status: "text", total_cents: "integer" } },
    { name: "order_items", description: "Lines of an order", columns: { id: "uuid", order_id: "uuid references orders", sku: "text", quantity: "integer" } },
    { name: "products", description: "Sellable products", columns: { sku: "text", title: "text", price_cents: "integer" } },
    { name: "stock_levels", description: "Stock per warehouse", columns: { sku: "text references products", warehouse_id: "uuid", on_hand: "integer" } },
    { name: "warehouses", description: "Warehouse locations", columns: { id: "uuid", city: "text" } },
    { name: "refunds", description: "Issued refunds", columns: { id: "uuid", order_id: "uuid references orders", amount_cents: "integer", reason: "text" } },
    { name: "audit_log", description: "Administrative actions", columns: { id: "uuid", actor: "text", action: "text", at: "timestamp" } },
  ],
};
