import { createHash, randomBytes } from 'node:crypto';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { isMachineToken } from '@clerk/backend/internal';
import { db } from './db.ts';

export interface AuthUser {
  id: string;
  name: string;
  auth: 'token' | 'clerk';
}

const TOKEN_PREFIX = 'feedr_';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Issues a personal access token. Only the hash is stored; the token is shown once. */
export async function createAccessToken(userId: string, name: string): Promise<string> {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
  await db
    .insertInto('access_tokens')
    .values({ user_id: userId, hash: hashToken(token), name })
    .execute();
  return token;
}

/**
 * OAuth on /mcp, for claude.ai and other connectors, with Clerk as the authorisation server.
 * On when PUBLIC_URL, CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY are set; otherwise null.
 * `resource` is the MCP URL a connector is given, and the audience its tokens must carry.
 * `issuer` is Clerk's Frontend API URL, which the publishable key encodes.
 */
export function mcpOAuth(): { resource: string; issuer: string; metadataUrl: string } | null {
  const { PUBLIC_URL, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY } = process.env;
  if (!PUBLIC_URL || !CLERK_SECRET_KEY || !CLERK_PUBLISHABLE_KEY) return null;
  // pk_test_… / pk_live_… is base64 of "<frontend api host>$".
  const host = Buffer.from(CLERK_PUBLISHABLE_KEY.split('_')[2] ?? '', 'base64')
    .toString()
    .replace(/\$$/, '');
  return {
    resource: new URL('/mcp', PUBLIC_URL).href,
    issuer: `https://${host}`,
    metadataUrl: new URL('/.well-known/oauth-protected-resource/mcp', PUBLIC_URL).href,
  };
}

/** Returns the Clerk user id of a Clerk OAuth access token issued for `audience`, or null. */
async function verifyOAuthToken(token: string, audience: string): Promise<string | null> {
  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    // Optional: Clerk's public key, to verify JWT access tokens offline. The tests use it.
    jwtKey: process.env.CLERK_JWT_KEY || undefined,
  });
  // Always pass audience: without it Clerk skips the check and accepts any OAuth token the instance issued.
  const state = await clerk.authenticateRequest(
    new Request(audience, { headers: { authorization: `Bearer ${token}` } }),
    {
      acceptsToken: 'oauth_token',
      audience,
    },
  );
  if (!state.isAuthenticated) return null;
  return state.toAuth().userId;
}

/**
 * Resolves a bearer token: a personal access token, or, when Clerk is configured, a Clerk session
 * token from the app's sign-in. `oauthAudience` is set only for /mcp, the one place a Clerk OAuth
 * access token (a connector's) is accepted, and only if it was issued for that audience.
 */
export async function authenticate(header: string | undefined, oauthAudience?: string): Promise<AuthUser | null> {
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;

  if (token.startsWith(TOKEN_PREFIX)) {
    const row = await db
      .selectFrom('access_tokens as t')
      .innerJoin('users as u', 'u.id', 't.user_id')
      .select(['u.id', 'u.name', 't.id as token_id'])
      .where('t.hash', '=', hashToken(token))
      .executeTakeFirst();
    if (!row) return null;
    void db.updateTable('access_tokens').set({ last_used_at: new Date() }).where('id', '=', row.token_id).execute();
    return { id: row.id, name: row.name, auth: 'token' };
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  let clerkUserId: string | null;
  if (isMachineToken(token)) {
    clerkUserId = oauthAudience ? await verifyOAuthToken(token, oauthAudience) : null;
  } else {
    try {
      clerkUserId = (await verifyToken(token, { secretKey })).sub;
    } catch {
      clerkUserId = null;
    }
  }
  if (!clerkUserId) return null;
  // First sign-in, from the app or a connector, creates the feedr user.
  const user =
    (await db.selectFrom('users').select(['id', 'name']).where('clerk_user_id', '=', clerkUserId).executeTakeFirst()) ??
    (await db
      .insertInto('users')
      .values({ name: 'Me', clerk_user_id: clerkUserId })
      .onConflict((oc) => oc.column('clerk_user_id').doUpdateSet({ clerk_user_id: clerkUserId }))
      .returning(['id', 'name'])
      .executeTakeFirstOrThrow());
  return { ...user, auth: 'clerk' };
}
