// Mock customer-support data shared by the support examples. All of it is invented.

export const CUSTOMERS = [
  {
    id: "C-1001", name: "Anna Weber", email: "anna.weber@example.com", verified: true,
    phone: "+49 30 5550101", address: "4 Lindenweg, Berlin", tier: "gold",
  },
  {
    id: "C-1002", name: "Ben Hartmann", email: "ben.hartmann@example.com", verified: false,
    phone: "+49 40 5550102", address: "18 Hafenstrasse, Hamburg", tier: "standard",
  },
  {
    id: "C-1003", name: "John Smith", email: "john.smith@example.com", verified: true,
    phone: "+44 20 5550103", address: "7 Park Road, London", tier: "standard",
  },
  {
    id: "C-1004", name: "John Smith", email: "j.smith@example.org", verified: true,
    phone: "+1 212 5550104", address: "90 Hudson Street, New York", tier: "gold",
  },
];

export const ORDERS = [
  { id: "ORD-12345", customer_id: "C-1001", item: "Noise-cancelling headphones", amount: 150, status: "delivered", ordered_on: "2026-09-02" },
  { id: "ORD-789", customer_id: "C-1001", item: "Desk lamp", amount: 45, status: "delivered", ordered_on: "2026-09-20" },
  { id: "ORD-555", customer_id: "C-1002", item: "Office chair", amount: 320, status: "delivered", ordered_on: "2026-08-14" },
  { id: "ORD-900", customer_id: "C-1003", item: "Standing desk", amount: 780, status: "shipped", ordered_on: "2026-10-11" },
];

export function findCustomers(query) {
  const needle = String(query).trim().toLowerCase();
  return CUSTOMERS.filter(
    (customer) => customer.name.toLowerCase() === needle || customer.email.toLowerCase() === needle
  );
}

export function findOrder(orderId) {
  return ORDERS.find((order) => order.id === orderId) ?? null;
}
