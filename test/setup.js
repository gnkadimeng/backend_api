// Jest setupFiles — runs BEFORE server.js is imported, so the pg Pool picks up
// the test database config. Defaults target a local/CI Postgres; never prod.
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'chieta_test';
process.env.DB_USER_NAME = process.env.DB_USER_NAME || 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
process.env.DB_SSLMODE = process.env.DB_SSLMODE || ''; // no SSL for local/CI Postgres
