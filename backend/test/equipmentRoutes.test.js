const test = require('node:test');
const assert = require('node:assert/strict');

const URL = process.env.TEST_DATABASE_URL;

// The app's db layer reads DATABASE_URL. Point it at the test database
// BEFORE requiring the app, so no test can reach production.
if (URL) process.env.DATABASE_URL = URL;

test('equipment asset-tag routes', { skip: !URL && 'TEST_DATABASE_URL not set' }, async (t) => {
  const request = require('supertest');
  const jwt = require('jsonwebtoken');
  const { Pool } = require('pg');
  const app = require('../src/server');

  const pool = new Pool({ connectionString: URL });

  // A technician user is required by isTechnician; authenticate looks it up by id.
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, is_active)
     VALUES ('routetest@kb.local', 'x', 'Route Test', 'technician', true)
     ON CONFLICT (email) DO UPDATE SET role = 'technician', is_active = true
     RETURNING id`
  );
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);

  // node:test runs multiple t.after() hooks in registration order, so the
  // row cleanup (which needs a live pool) must be registered before
  // pool.end() rather than after it.
  t.after(async () => {
    await pool.query(`DELETE FROM equipment WHERE qr_code LIKE 'ROUTETEST-%'`);
    await pool.query(`DELETE FROM users WHERE email = 'routetest@kb.local'`);
  });
  t.after(() => pool.end());

  await t.test('GET /asset-tag/:tag rejects a non-tag with 400', async () => {
    const res = await auth(request(app).get('/api/equipment/asset-tag/N%2FA'));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /valid asset tag/i);
  });

  await t.test('GET /asset-tag/:tag returns 404 for an unassigned tag', async () => {
    const res = await auth(request(app).get('/api/equipment/asset-tag/999999'));
    assert.equal(res.status, 404);
  });

  await t.test('GET /asset-tag/:tag returns the equipment for an assigned tag', async () => {
    await pool.query(
      `INSERT INTO equipment (name, qr_code, asset_tag) VALUES ('Route Fixture','ROUTETEST-1','0801')`
    );
    const res = await auth(request(app).get('/api/equipment/asset-tag/0801'));
    assert.equal(res.status, 200);
    assert.equal(res.body.equipment.asset_tag, '0801');
    assert.equal(res.body.equipment.name, 'Route Fixture');
  });

  await t.test('POST / rejects a duplicate asset tag with 409', async () => {
    const res = await auth(request(app).post('/api/equipment'))
      .send({ name: 'Dupe Attempt', asset_tag: '0801' });
    assert.equal(res.status, 409);
    assert.ok(res.body.conflict, 'expected the conflicting row to be reported');
  });

  await t.test('POST / stores a valid tag and preserves leading zeros', async () => {
    const res = await auth(request(app).post('/api/equipment'))
      .send({ name: 'New Scan', asset_tag: '0802' });
    assert.equal(res.status, 201);
    assert.equal(res.body.equipment.asset_tag, '0802');
    await pool.query(`UPDATE equipment SET qr_code = 'ROUTETEST-2' WHERE id = $1`,
      [res.body.equipment.id]);
  });

  await t.test('PATCH /:id/asset-tag binds a tag to existing equipment', async () => {
    const { rows: [eq] } = await pool.query(
      `INSERT INTO equipment (name, qr_code) VALUES ('Bind Target','ROUTETEST-3') RETURNING id`
    );
    const res = await auth(request(app).patch(`/api/equipment/${eq.id}/asset-tag`))
      .send({ asset_tag: '0803' });
    assert.equal(res.status, 200);
    assert.equal(res.body.equipment.asset_tag, '0803');
  });

  await t.test('PATCH /:id/asset-tag returns 409 when the tag belongs to another asset', async () => {
    const { rows: [eq] } = await pool.query(
      `INSERT INTO equipment (name, qr_code) VALUES ('Other','ROUTETEST-4') RETURNING id`
    );
    const res = await auth(request(app).patch(`/api/equipment/${eq.id}/asset-tag`))
      .send({ asset_tag: '0801' });
    assert.equal(res.status, 409);
  });

  await t.test('POST /identify requires a photo', async () => {
    const res = await auth(request(app).post('/api/equipment/identify'));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /no photo/i);
  });
});
