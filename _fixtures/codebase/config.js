// Application settings. Secrets come from the environment.

export const config = {
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  // Session lifetime in minutes.
  sessionTtlMinutes: 30,
  // VAT as a fraction: 0.19 means 19 percent.
  vatRate: 0.19,
  maxCartItems: 50,
  mailFrom: "orders@shop.example",
};
