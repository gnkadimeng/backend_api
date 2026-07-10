const request = require('supertest');
const { app, pgPool } = require('../server');

// Accounts seeded by db/seed.sql (synthetic, non-PII).
const USER = { email: 'test@chieta.test', password: 'Test1234!' };     // bcrypt-hashed
const ADMIN = { email: 'admin@chieta.test', password: 'Admin1234!' };  // Administrator
const LEGACY = { email: 'legacy@chieta.test', password: 'Legacy123!' };// plaintext (upgrade path)

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
let token, adminToken;

beforeAll(async () => {
  token = (await request(app).post('/login').send(USER)).body.token;
  adminToken = (await request(app).post('/login').send(ADMIN)).body.token;
});
afterAll(async () => { await pgPool.end(); });

describe('public endpoints (no token)', () => {
  test('GET /health -> 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });
  test('GET /openapi.json -> 200 valid OpenAPI 3', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
  });
  test('GET /api-docs -> serves Swagger UI', async () => {
    const res = await request(app).get('/api-docs/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/swagger-ui/i);
  });
  test('GET /nonexistent WITHOUT token -> 401 (auth runs before routing)', async () => {
    expect((await request(app).get('/nope')).status).toBe(401);
  });
});

describe('routing', () => {
  test('GET /nonexistent WITH token -> 404', async () => {
    expect((await request(app).get('/nope').set(bearer(token))).status).toBe(404);
  });
});

describe('auth /login', () => {
  test('valid (bcrypt) creds -> 200 with JWT', async () => {
    const res = await request(app).post('/login').send(USER);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.email).toBe(USER.email);
  });
  test('legacy plaintext account logs in AND is upgraded to bcrypt', async () => {
    const res = await request(app).post('/login').send(LEGACY);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    const { rows } = await pgPool.query('SELECT password FROM mobile_app_login WHERE email=$1', [LEGACY.email]);
    expect(rows[0].password).toMatch(/^\$2[aby]\$/); // now hashed
  });
  test('wrong password -> 401', async () => {
    expect((await request(app).post('/login').send({ email: USER.email, password: 'x' })).status).toBe(401);
  });
  test('missing password -> 400', async () => {
    expect((await request(app).post('/login').send({ email: USER.email })).status).toBe(400);
  });
  test('inactive account -> 401', async () => {
    expect((await request(app).post('/login').send({ email: 'inactive@chieta.test', password: 'x' })).status).toBe(401);
  });
  test('SQL-injection attempt safely rejected', async () => {
    expect((await request(app).post('/login').send({ email: "x' OR '1'='1", password: "x' OR '1'='1" })).status).toBe(401);
  });
});

describe('authorization is enforced (fixes IDOR)', () => {
  test('protected endpoint WITHOUT token -> 401', async () => {
    expect((await request(app).get(`/documents-stats/${USER.email}`)).status).toBe(401);
  });
  test('invalid token -> 401', async () => {
    expect((await request(app).get('/mg-status').set({ Authorization: 'Bearer garbage' })).status).toBe(401);
  });
  test('valid token, own data -> 200', async () => {
    expect((await request(app).get(`/documents-stats/${USER.email}`).set(bearer(token))).status).toBe(200);
  });
  test("IDOR blocked: user A cannot read user B's data -> 403", async () => {
    expect((await request(app).get('/gm-dashboard/admin@chieta.test').set(bearer(token))).status).toBe(403);
  });
  test('Administrator may access any user (not 403)', async () => {
    const res = await request(app).get('/user/nobody@nowhere.zz').set(bearer(adminToken));
    expect(res.status).not.toBe(403);
    expect([200, 404]).toContain(res.status);
  });
});

describe('regression: previously-500 endpoints (authed)', () => {
  test('/documents-stats -> 200 counts (was 500)', async () => {
    const res = await request(app).get(`/documents-stats/${USER.email}`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.total_documents).toBe(2);
  });
  test('/organisation-profile -> 200 joined contact (was 500)', async () => {
    const res = await request(app).get(`/organisation-profile/${USER.email}`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.contact_person).toBe('Jane Doe');
  });
  test('/organisation-detail -> 200 mapped columns (was 500)', async () => {
    const res = await request(app).get('/organisation-detail/L000000001').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.city).toBe('Johannesburg');
  });
});

describe('data endpoints (authed)', () => {
  test('/mg-status -> 200 array', async () => {
    const res = await request(app).get('/mg-status').set(bearer(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
