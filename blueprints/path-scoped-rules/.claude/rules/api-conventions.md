---
# Copy to .claude/rules/. Combine a fixed directory with `**/routes/**/*` to catch handlers elsewhere.
paths: "src/api/**/*, **/routes/**/*"
---
# API Conventions

- All endpoints return the { data, error, metadata } response shape.
- Use Zod schemas for request validation at the handler boundary.
- Log the request ID on every error response.
- Rate limiting must be explicit, not inherited from defaults.
