import { createAccessToken } from './auth.ts';
import { db, migrate } from './db.ts';

// npm run account:create -- "Your name"            → new user + token
// npm run account:create -- "Token name" <userId>  → new token for an existing user
await migrate();
const name = process.argv[2] || 'Me';
const existingId = process.argv[3];
const user = existingId
  ? await db.selectFrom('users').select(['id', 'name']).where('id', '=', existingId).executeTakeFirstOrThrow()
  : await db.insertInto('users').values({ name }).returning(['id', 'name']).executeTakeFirstOrThrow();
const token = await createAccessToken(user.id, existingId ? name : 'Initial personal token');
await db.destroy();
console.log(JSON.stringify({ userId: user.id, name: user.name, token }, null, 2));
