// Test data factories. Overrides replace the defaults.
export const buildUser = (overrides = {}) => ({ id: "user-1", email: "ada@example.invalid", disabled: false, ...overrides });
export const buildOrder = (overrides = {}) => ({ id: "order-1", userId: "user-1", totalCents: 1200, ...overrides });
