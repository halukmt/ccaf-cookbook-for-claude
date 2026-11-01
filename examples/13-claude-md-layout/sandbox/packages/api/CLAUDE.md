# API Conventions

API id: STD-API-5587

- REST endpoint paths are written in kebab-case.
- Every response has the shape { data, error, metadata }.
- Request bodies get validated by Zod schemas where the handler receives them.
