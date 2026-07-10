# CHIETA Backend API

REST API powering the CHIETA mobile application authentication, grant dashboards, organisation data, and documents. Node.js / Express / PostgreSQL.

## Quick start

```bash
cp .env.example .env          # fill in real values (never commit .env)
npm ci
npm start                     # or: npm run dev  (nodemon)
```

The server fails fast if any required env var is missing:

| Var | Purpose |
|---|---|
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER_NAME` `DB_PASSWORD` | PostgreSQL connection |
| `DB_SSLMODE` | `require` for managed Postgres; empty for local |
| `SECRET_KEY` | signing key for JWTs |
| `PORT` | listen port (default `5000`) |

## Authentication

All endpoints require a **JWT bearer token** except `/health`, `/login`, and the docs.

```bash
# 1) get a token
curl -X POST https://ssdd.chieta.org.za/mobile-api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"secret"}'
# -> { "message": "Login successful", "token": "eyJ…", "user": { … } }

# 2) use it on every other call
curl https://ssdd.chieta.org.za/mobile-api/mg-status \
  -H "Authorization: Bearer <token>"
```

- Passwords are verified with **bcrypt** (legacy plaintext rows are transparently re-hashed on first login).
- Email is matched **case-insensitively**.
- Email-keyed resources are **owner-scoped**: you may only read your own data (`403` otherwise). Administrators may read any.

## 📖 API documentation

| Format | Where |
|---|---|
| **Interactive (Swagger UI)** | [`/api-docs`](https://ssdd.chieta.org.za/mobile-api/api-docs/) — try any endpoint live |
| **OpenAPI 3 spec** | [`/openapi.json`](https://ssdd.chieta.org.za/mobile-api/openapi.json) · source in [`docs/openapi.js`](docs/openapi.js) |
| **Postman collection** | [`docs/chieta-api.postman_collection.json`](docs/chieta-api.postman_collection.json) — import to Postman |

### Endpoints at a glance

| Group | Endpoints |
|---|---|
| **System** | `GET /health` · `GET /uploads-check` |
| **Auth** | `POST /login` |
| **Users** | `GET /user/:email` |
| **Students** | `GET /students/:email` · `GET /student-status/:email` |
| **Documents** | `GET /documents/:email` · `GET /documents-stats/:email` · `GET /download/document/:filename` · `GET /download-document/:applicationNumber/:documentType` |
| **GM Dashboard** | `GET /summary-stats/:email` · `GET /program-breakdown/:email` · `GET /contract-details/:email` · `GET /gm-dashboard/:email` · `GET /organisation-profile/:email` |
| **IM Dashboard** | `GET /mg-status` · `GET /dg-status` · `GET /organisation-applications/:email` · `GET /organisation-contracts` · `GET /organisation-detail/:sdlNo` · `GET /mg-applications-details/:sdlNo` · `GET /dg-applications-details/:sdlNo` · `GET /mg-application-detail/:applicationNumber` · `GET /dg-application-detail/:applicationNumber` |

Full request/response schemas are in the OpenAPI spec and Swagger UI.

### Error conventions

| Status | Meaning |
|---|---|
| `400` | Missing/invalid request body |
| `401` | Missing or invalid token (or bad credentials on `/login`) |
| `403` | Authenticated but not permitted for that resource |
| `404` | Resource not found |
| `500` | Server error |

## Testing

```bash
npm test        # Jest + Supertest against a seeded Postgres
```

CI (`.github/workflows/ci.yml`) spins up a Postgres service, loads [`db/schema.sql`](db/schema.sql) + [`db/seed.sql`](db/seed.sql) (synthetic, no PII), and runs the suite on Node 18 & 20.

## Notes

- Secrets are injected via environment only — never commit `.env`.
- The database is a managed/on-prem PostgreSQL; `db/schema.sql` is structure-only (no data).
