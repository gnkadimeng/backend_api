const request = require('supertest');
const { app, pgPool } = require('../server');

// Test account seeded by db/seed.sql (synthetic, non-PII).
const USER = { email: 'test@chieta.test', password: 'Test1234!' };

afterAll(async () => {
  await pgPool.end(); // let Jest exit cleanly
});

describe('health & smoke', () => {
  test('GET /health -> 200 OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  test('GET /nonexistent-route -> 404', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
  });
});

describe('auth /login', () => {
  test('valid credentials -> 200 with user', async () => {
    const res = await request(app).post('/login').send(USER);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(USER.email);
  });

  test('wrong password -> 401', async () => {
    const res = await request(app).post('/login').send({ email: USER.email, password: 'nope' });
    expect(res.status).toBe(401);
  });

  test('missing password -> 400', async () => {
    const res = await request(app).post('/login').send({ email: USER.email });
    expect(res.status).toBe(400);
  });

  test('inactive account (accountstatus=false) -> 401', async () => {
    const res = await request(app).post('/login').send({ email: 'inactive@chieta.test', password: 'x' });
    expect(res.status).toBe(401);
  });

  test('SQL-injection attempt is safely rejected (parameterized)', async () => {
    const res = await request(app).post('/login').send({ email: "x' OR '1'='1", password: "x' OR '1'='1" });
    expect(res.status).toBe(401);
  });
});

// Regression tests for the three schema-drift 500s that were fixed.
describe('regression: previously-500 endpoints', () => {
  test('GET /documents-stats/:email -> 200 with counts (was 500)', async () => {
    const res = await request(app).get(`/documents-stats/${USER.email}`);
    expect(res.status).toBe(200);
    expect(res.body.total_documents).toBe(2); // 2 seeded docs
  });

  test('GET /organisation-profile/:email -> 200 with joined contact (was 500)', async () => {
    const res = await request(app).get(`/organisation-profile/${USER.email}`);
    expect(res.status).toBe(200);
    expect(res.body.organisation_name).toBe('Acme Test (Pty) Ltd');
    expect(res.body.contact_person).toBe('Jane Doe'); // proves the LEFT JOIN works
  });

  test('GET /organisation-detail/:sdlNo -> 200 mapped columns (was 500)', async () => {
    const res = await request(app).get('/organisation-detail/L000000001');
    expect(res.status).toBe(200);
    expect(res.body.SDL_No).toBe('L000000001');
    expect(res.body.city).toBe('Johannesburg'); // municipality -> city mapping
  });
});

describe('data endpoints', () => {
  test('GET /mg-status -> 200 array', async () => {
    const res = await request(app).get('/mg-status');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /user/:email nonexistent -> 404', async () => {
    const res = await request(app).get('/user/nobody@nowhere.zz');
    expect(res.status).toBe(404);
  });
});

// Documents a KNOWN security gap so it stays visible in CI until fixed.
// See the assessment: S2 (broken access control / IDOR). This asserts the
// CURRENT (insecure) behaviour on purpose; when auth is added, flip it to 401.
describe('SECURITY (known gaps — see issue S2)', () => {
  test('IDOR: any dashboard is reachable with no auth token [KNOWN GAP]', async () => {
    const res = await request(app).get('/gm-dashboard/admin@chieta.test');
    expect(res.status).toBe(200); // TODO: should be 401 once auth is implemented
  });
});
