---
paths: ["src/api/**/*", "**/routes/**/*"]
---
# API Conventions

Rule id: RULE-API-3302

- All endpoints return the { data, error, metadata } response shape.
- Use Zod schemas for request validation at the handler boundary.
- Log the request ID on every error response.
- Rate limiting must be explicit, not inherited from defaults.
