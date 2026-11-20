import { createAccessToken } from './auth.ts';
import { db, migrate } from './db.ts';

// pnpm account:create "Your name"                       → new user + token
// pnpm account:create "Token name" <userId>             → new token for an existing user
// pnpm account:create "Your name" --clerk <clerkUserId> → the user for a Clerk login, no token
//   (finds the account the API made at first sign-in, or makes it; scripts/setup.sh uses it to load demo data)
await migrate();
const name = process.argv[2] || 'Me';

if (process.argv[3] === '--clerk') {
  const clerkUserId = process.argv[4];
  if (!clerkUserId) throw new Error('Usage: pnpm account:create "Your name" --clerk <clerkUserId>');
  const user =
    (await db.selectFrom('users').select(['id', 'name']).where('clerk_user_id', '=', clerkUserId).executeTakeFirst()) ??
    (await db.insertInto('users').values({ name, clerk_user_id: clerkUserId }).returning(['id', 'name']).executeTakeFirstOrThrow());
  await db.destroy();
  console.log(JSON.stringify({ userId: user.id, name: user.name }, null, 2));
} else {
  const existingId = process.argv[3];
  const user = existingId
    ? await db.selectFrom('users').select(['id', 'name']).where('id', '=', existingId).executeTakeFirstOrThrow()
    : await db.insertInto('users').values({ name }).returning(['id', 'name']).executeTakeFirstOrThrow();
  const token = await createAccessToken(user.id, existingId ? name : 'Initial personal token');
  await db.destroy();
  console.log(JSON.stringify({ userId: user.id, name: user.name, token }, null, 2));
}
