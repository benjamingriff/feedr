// Account scripts. They use whichever database DATABASE_URL names: the local one from .env, or the
// production one through the pnpm prod:* commands.
//   pnpm account:list            every account, with its id and how much it holds
//   pnpm account:nuke <userId>   deletes everything in an account except the account itself (asks first)
import { createInterface } from 'node:readline/promises';
import { db } from '../src/db.ts';
import { accountDataCounts, clearAccountData, type AccountDataCounts } from '../src/service.ts';

const [command, userId] = process.argv.slice(2);
const host = new URL(process.env.DATABASE_URL!).host;

const describe = (c: AccountDataCounts) =>
  `${c.recipes} recipes, ${c.people} people, ${c.ingredients} ingredients and ${c.services} planned cooks`;

try {
  if (command === 'list') {
    const users = await db.selectFrom('users').select(['id', 'name', 'clerk_user_id']).orderBy('created_at').execute();
    console.log(`Accounts on ${host}:`);
    for (const user of users) {
      const login = user.clerk_user_id ? `Clerk ${user.clerk_user_id}` : 'tokens only';
      console.log(`  ${user.id}  ${user.name} (${login}): ${describe(await accountDataCounts(user.id))}`);
    }
  } else if (command === 'nuke' && userId) {
    const user = await db.selectFrom('users').select(['id', 'name']).where('id', '=', userId).executeTakeFirst();
    if (!user) throw new Error(`No account ${userId} on ${host}. pnpm account:list shows them.`);
    console.log(`This deletes ${describe(await accountDataCounts(user.id))}`);
    console.log(`from ${user.name}'s account (${user.id}) on ${host}.`);
    console.log('The account, its sign-in and its agent tokens stay.');
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question('Type "nuke" to go ahead: ');
    prompt.close();
    if (answer.trim() === 'nuke') {
      await clearAccountData(user.id);
      console.log('Deleted. Pull down on the Home screen to refresh.');
    } else {
      console.log('Nothing deleted.');
    }
  } else {
    throw new Error('Usage: pnpm account:list | pnpm account:nuke <userId>');
  }
} finally {
  await db.destroy();
}
