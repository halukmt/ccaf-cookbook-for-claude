// Realistic failed extractions for the retry path, written by hand and labelled as such everywhere
// they are used. The model got these documents right on its own, so the failure had to be supplied.

const shared = { category: "invoice", conflict_detected: false };

export const SEEDED = {
  // The subtotal row is read as a charge, which is the misread this document invites.
  d10: {
    ...shared, vendor_name: "Greenline Print Co.", invoice_number: "GP-7741", invoice_date: "2024-01-22", due_date: "2024-02-21", tax_id: "12-3456789",
    line_items: [
      { description: "Brochures", amount: 600, detected_pattern: "table_row" },
      { description: "Posters", amount: 200, detected_pattern: "table_row" },
      { description: "Subtotal", amount: 800, detected_pattern: "table_row" },
      { description: "Loyalty discount", amount: -80, detected_pattern: "discount" },
      { description: "Sales tax", amount: 57.6, detected_pattern: "tax_line" },
    ],
    calculated_total: 1577.6, stated_total: 777.6, total_discrepancy: true,
  },
  // The unit price column is taken for the line total, which the reordered columns invite.
  d18: {
    ...shared, vendor_name: "Orion Lab Supplies Inc.", invoice_number: "OL-20240912-7", invoice_date: "2024-09-12", due_date: "2024-10-12", tax_id: "98-7654321",
    line_items: [
      { description: "Pipettes", amount: 12.5, detected_pattern: "table_row" },
      { description: "Gloves", amount: 9, detected_pattern: "table_row" },
    ],
    calculated_total: 21.5, stated_total: 161, total_discrepancy: true,
  },
};
