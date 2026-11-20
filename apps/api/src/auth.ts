import { createHash, randomBytes } from 'node:crypto';
import { verifyToken } from '@clerk/backend';
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

/** Resolves a bearer token: a personal access token, or a Clerk session token when Clerk is configured. */
export async function authenticate(header: string | undefined): Promise<AuthUser | null> {
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
  let clerkUserId: string;
  try {
    clerkUserId = (await verifyToken(token, { secretKey })).sub;
  } catch {
    return null;
  }
  // First sign-in creates the feedr user.
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
