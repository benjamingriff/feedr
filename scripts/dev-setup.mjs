// pnpm dev:setup: gives a new worktree its .env files, copied from the main checkout, so the API,
// tests and scripts work there straight away. Every worktree shares compose.yaml's Postgres, so the
// values carry over unchanged, except that the production database address is never copied (the
// prod:* commands read it from the main checkout) and a live Clerk secret key is left out.
// Files the worktree already has are kept.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mainCheckout, readEnv, root } from './lib/checkouts.mjs';

if (mainCheckout === root) {
  console.log('This is the main checkout. Run ./scripts/setup.sh to set it up.');
  process.exit(0);
}

const env = resolve(root, '.env');
if (existsSync(env)) {
  console.log('.env: already there, kept.');
} else {
  const main = readEnv(resolve(mainCheckout, '.env'));
  if (!Object.keys(main).length) throw new Error(`${mainCheckout} has no .env. Run ./scripts/setup.sh there first.`);
  if (main.CLERK_SECRET_KEY && !main.CLERK_SECRET_KEY.startsWith('sk_test_')) {
    console.warn('Left out CLERK_SECRET_KEY: it is not a development key (sk_test_…).');
    main.CLERK_SECRET_KEY = '';
  }
  // .env.example's layout and comments, with the main checkout's values filled in.
  const lines = readFileSync(resolve(root, '.env.example'), 'utf8')
    .split('\n')
    .map((line) => {
      const key = line.match(/^([A-Z0-9_]+)=/)?.[1];
      if (!key || key === 'PROD_DATABASE_URL' || main[key] === undefined) return line;
      return `${key}=${main[key]}`;
    });
  writeFileSync(env, lines.join('\n'), { mode: 0o600 });
  console.log(`.env: copied from ${mainCheckout}.`);
}

const mobile = 'apps/mobile/.env.local';
if (existsSync(resolve(root, mobile))) {
  console.log(`${mobile}: already there, kept.`);
} else if (existsSync(resolve(mainCheckout, mobile))) {
  copyFileSync(resolve(mainCheckout, mobile), resolve(root, mobile));
  console.log(`${mobile}: copied from ${mainCheckout}.`);
} else {
  console.log(`${mobile}: the main checkout has none, so the app isn't set up here. ./scripts/setup.sh makes it.`);
}
