import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { validateFields } from './worker.js';

const origin = 'https://depths.jellys-space.vip';
const applicant = { discordUsername: 'Wumpus', discordUserId: '123456789012345678', minecraftUsername: 'Wumpie74', website: '', turnstileToken: 'test-token' };

function fixture(options = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./migrations/0001_submissions.sql', import.meta.url), 'utf8'));
  const calls = { verify: 0, discord: 0 };
  const env = { DB: { prepare(sql) {
    return { bind(...values) { return { async run() {
      if (options.dbFails || (options.updateFails && sql.startsWith('UPDATE')) || (options.deleteFails && sql.startsWith('DELETE'))) throw new Error('simulated D1 failure');
      const result = sqlite.prepare(sql).run(...values);
      return { meta: { changes: result.changes } };
    } }; } };
  } }, TURNSTILE_SECRET_KEY: 'TEST_ONLY', DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/TEST_ONLY' };
  // All external HTTP is intercepted. No production secrets or network calls.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/siteverify')) {
      calls.verify++;
      if (options.verifyThrows) throw new Error('verification unavailable');
      assert.equal(JSON.parse(init.body).response, 'test-token');
      return Response.json({ success: !options.verifyFails, hostname: options.hostname || 'depths.jellys-space.vip', action: options.action || 'request_access' });
    }
    assert.equal(new URL(url).searchParams.get('wait'), 'true');
    calls.discord++;
    const body = JSON.parse(init.body);
    assert.deepEqual(body.allowed_mentions.parse, []);
    assert.equal(body.embeds[0].fields[1].value, `<@${options.expectedId || applicant.discordUserId}>`);
    assert.ok(!body.embeds[0].fields[0].value.includes('@everyone'));
    if (options.discordThrows) throw new Error('timeout after possible delivery');
    return new Response(null, { status: options.discordStatus || 200 });
  };
  const submit = (patch = {}, init = {}) => worker.fetch(new Request('https://worker.test/', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...init.headers },
    body: JSON.stringify({ ...applicant, ...patch }), ...init
  }), env);
  const rows = () => sqlite.prepare('SELECT * FROM submissions').all();
  return { env, calls, submit, rows, close() { globalThis.fetch = originalFetch; sqlite.close(); } };
}

test('field validation rejects malformed identities and normalizes Minecraft case', () => {
  assert.equal(validateFields({ ...applicant, discordUsername: '\n@everyone\u0000' }), null);
  for (const patch of [{ discordUserId: '1e18' }, { discordUserId: 123 }, { discordUserId: '0123456789012345678' }, { minecraftUsername: 'bad-name' }, { minecraftUsername: 'aa' }, { discordUsername: 'x' }, { website: {} }]) {
    assert.equal(validateFields({ ...applicant, ...patch }), null);
  }
  assert.equal(validateFields(applicant).minecraftUsernameNormalized, 'wumpie74');
});

test('first delivery persists; either identity and case variants are permanently blocked', async () => {
  const f = fixture();
  try {
    assert.equal((await f.submit()).status, 200);
    assert.equal(f.rows()[0].status, 'delivered');
    assert.ok(f.rows()[0].delivered_at);
    for (const patch of [{ minecraftUsername: 'OtherName' }, { discordUserId: '987654321098765432' }, { minecraftUsername: 'wUMPIE74', discordUserId: '987654321098765432' }]) {
      const response = await f.submit(patch);
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, 'already_submitted');
    }
    assert.equal(f.calls.discord, 1);
  } finally { f.close(); }
});

test('concurrent identical requests produce one reservation and one webhook', async () => {
  const f = fixture();
  try {
    const results = await Promise.all(Array.from({ length: 12 }, () => f.submit()));
    assert.equal(results.filter((response) => response.status === 200).length, 1);
    assert.equal(results.filter((response) => response.status === 409).length, 11);
    assert.equal(f.calls.discord, 1);
    assert.equal(f.rows().length, 1);
  } finally { f.close(); }
});

test('SQLite enforces both unique keys and the normalization check directly', () => {
  const f = fixture();
  try {
    const db = new DatabaseSync(':memory:');
    db.exec(readFileSync(new URL('./migrations/0001_submissions.sql', import.meta.url), 'utf8'));
    const insert = db.prepare('INSERT INTO submissions (id, discord_user_id, discord_username, minecraft_username, minecraft_username_normalized) VALUES (?, ?, ?, ?, ?)');
    insert.run('1', '123456789012345678', 'Example', 'PlayerOne', 'playerone');
    assert.throws(() => insert.run('2', '123456789012345678', 'Other', 'PlayerTwo', 'playertwo'), /UNIQUE/);
    assert.throws(() => insert.run('3', '987654321098765432', 'Other', 'PLAYERONE', 'playerone'), /UNIQUE/);
    assert.throws(() => insert.run('4', '987654321098765432', 'Other', 'PlayerTwo', 'PlayerTwo'), /CHECK/);
    db.close();
  } finally { f.close(); }
});

for (const status of [400, 401, 403, 404, 429]) {
  test(`definite Discord ${status} rejection releases the reservation for retry`, async () => {
    const f = fixture({ discordStatus: status });
    try {
      assert.equal((await f.submit()).status, 502);
      assert.equal(f.rows().length, 0);
      await f.submit();
      assert.equal(f.calls.discord, 2);
    } finally { f.close(); }
  });
}

for (const options of [{ discordStatus: 500 }, { discordThrows: true }, { updateFails: true }]) {
  test(`uncertainty or delivered-status write failure retains identities: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    try {
      const response = await f.submit();
      assert.equal(response.status, options.updateFails ? 200 : 502);
      assert.equal(f.rows().length, 1);
      assert.equal((await f.submit()).status, 409);
      assert.equal(f.calls.discord, 1);
    } finally { f.close(); }
  });
}

for (const options of [{ verifyFails: true }, { hostname: 'attacker.test' }, { action: 'wrong_action' }, { verifyThrows: true }, { dbFails: true }]) {
  test(`verification and storage fail closed: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    try {
      assert.ok((await f.submit()).status >= 400);
      assert.equal(f.calls.discord, 0);
      assert.equal(f.rows().length, 0);
    } finally { f.close(); }
  });
}

test('failed reservation cleanup keeps the identity for administrator review', async () => {
  const f = fixture({ discordStatus: 400, deleteFails: true });
  try {
    assert.equal((await (await f.submit()).json()).code, 'delivery_uncertain');
    assert.equal(f.rows().length, 1);
  } finally { f.close(); }
});

test('CORS, health, preflight, methods, JSON, size, honeypot and tokens', async () => {
  const f = fixture();
  try {
    const health = await worker.fetch(new Request('https://worker.test/'), f.env);
    assert.equal(health.status, 200);
    const options = await worker.fetch(new Request('https://worker.test/', { method: 'OPTIONS', headers: { Origin: origin } }), f.env);
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('Access-Control-Allow-Origin'), origin);
    const forbidden = await f.submit({}, { headers: { Origin: 'https://attacker.test', 'Content-Type': 'application/json' } });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal((await f.submit({}, { headers: { 'Content-Type': 'application/json' } })).status, 403);
    assert.equal((await worker.fetch(new Request('https://worker.test/', { method: 'PUT', headers: { Origin: origin } }), f.env)).status, 405);
    assert.equal((await f.submit({}, { headers: { Origin: origin, 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal((await f.submit({}, { body: '{bad' })).status, 400);
    assert.equal((await f.submit({ discordUsername: 'x'.repeat(5000) })).status, 413);
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5000)); controller.close(); } });
    assert.equal((await f.submit({}, { body: stream, duplex: 'half' })).status, 413);
    assert.equal((await f.submit({ turnstileToken: '' })).status, 400);
    assert.equal((await f.submit({ website: 'bot.test' })).status, 200);
    assert.equal(f.calls.verify, 0);
    assert.equal(f.calls.discord, 0);
    assert.equal(f.rows().length, 0);
    delete f.env.TURNSTILE_SECRET_KEY;
    assert.equal((await f.submit()).status, 503);
  } finally { f.close(); }
});

test('mention text is neutralized and ID remains displayed with mentions disabled', async () => {
  const f = fixture();
  try { assert.equal((await f.submit({ discordUsername: '@everyone **test** <@123>' })).status, 200); }
  finally { f.close(); }
});

test('origin override is an exact comma-separated allowlist', async () => {
  const f = fixture();
  try {
    f.env.ALLOWED_ORIGINS = 'https://other.test';
    assert.equal((await f.submit()).status, 403);
  } finally { f.close(); }
});
