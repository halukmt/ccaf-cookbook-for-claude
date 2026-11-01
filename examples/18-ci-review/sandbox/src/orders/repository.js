// Order lookups.
export function createOrderRepository(database) {
  return {
    findById: (id) => database.query("SELECT * FROM orders WHERE id = $1", [id]),
  };
}
