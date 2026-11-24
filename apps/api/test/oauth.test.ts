// OAuth on /mcp with Clerk as the authorisation server. Clerk's OAuth access tokens here are
// JWTs signed with a local key, which @clerk/backend verifies offline through CLERK_JWT_KEY.
import { generateKeyPairSync, sign } from 'node:crypto';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

const clerkHost = 'feedr-test.clerk.accounts.dev';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.PUBLIC_URL = 'https://feedr.example.com';
process.env.CLERK_SECRET_KEY = 'sk_test_oauth';
process.env.CLERK_PUBLISHABLE_KEY = `pk_test_${Buffer.from(`${clerkHost}$`).toString('base64')}`;
process.env.CLERK_JWT_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const { app } = await import('../src/app.ts');
const { createAccessToken } = await import('../src/auth.ts');
const { db, migrate } = await import('../src/db.ts');

const MCP_URL = 'https://feedr.example.com/mcp';
const METADATA_URL = 'https://feedr.example.com/.well-known/oauth-protected-resource/mcp';
const clerkUserId = `user_oauth_${Date.now()}`;

/** A Clerk-style OAuth access token (typ at+jwt) for the given audience. */
function oauthToken(aud: string): string {
  const now = Math.floor(Date.now() / 1000);
  const part = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const body = `${part({ alg: 'RS256', typ: 'at+jwt', kid: 'ins_test' })}.${part({
    iss: `https://${clerkHost}`,
    sub: clerkUserId,
    aud,
    client_id: 'client_test',
    scope: 'profile',
    jti: 'oat_test',
    iat: now,
    nbf: now,
    exp: now + 300,
  })}`;
  return `${body}.${sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`;
}

const listTools = (authorization?: string) =>
  app.request('/mcp', {
    method: 'POST',
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });

before(migrate);
after(async () => {
  await db.deleteFrom('users').where('clerk_user_id', '=', clerkUserId).execute();
  await db.destroy();
});

test('a 401 from /mcp points to the protected-resource metadata', async () => {
  const res = await listTools();
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('WWW-Authenticate'), `Bearer resource_metadata="${METADATA_URL}"`);

  const bad = await listTools('Bearer nope');
  assert.equal(bad.status, 401);
  assert.equal(
    bad.headers.get('WWW-Authenticate'),
    `Bearer error="invalid_token", resource_metadata="${METADATA_URL}"`,
  );

  assert.equal((await app.request('/recipes')).headers.get('WWW-Authenticate'), null);
});

test('the metadata names /mcp as the resource and Clerk as the authorisation server', async () => {
  const res = await app.request('/.well-known/oauth-protected-resource/mcp');
  assert.equal(res.status, 200);
  const metadata = (await res.json()) as { resource: string; authorization_servers: string[] };
  assert.equal(metadata.resource, MCP_URL);
  assert.deepEqual(metadata.authorization_servers, [`https://${clerkHost}`]);
});

test('an OAuth token for /mcp signs in its Clerk user, and only on /mcp', async () => {
  const token = oauthToken(MCP_URL);
  const res = await listTools(`Bearer ${token}`);
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { result: { tools: unknown[] } };
  assert.ok(body.result.tools.length > 0);
  assert.ok(await db.selectFrom('users').select('id').where('clerk_user_id', '=', clerkUserId).executeTakeFirst());

  assert.equal((await app.request('/me', { headers: { Authorization: `Bearer ${token}` } })).status, 401);
});

test('an OAuth token for another audience is refused', async () => {
  const res = await listTools(`Bearer ${oauthToken('https://other.example.com/mcp')}`);
  assert.equal(res.status, 401);
});

test('personal tokens still work on /mcp', async () => {
  const userId = (await db.insertInto('users').values({ name: 'Token' }).returning('id').executeTakeFirstOrThrow()).id;
  const res = await listTools(`Bearer ${await createAccessToken(userId, 'test')}`);
  assert.equal(res.status, 200);
  await db.deleteFrom('users').where('id', '=', userId).execute();
});
