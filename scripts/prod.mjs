// Runs a command against the production database instead of the local one, e.g.
//   node scripts/prod.mjs pnpm account:list
// The pnpm prod:* commands use it. The address is PROD_DATABASE_URL, from the environment or the main
// checkout's .env, so it's kept in one place and works from any worktree. It stops when the address
// is missing rather than falling back to the local database.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mainCheckout, readEnv } from './lib/checkouts.mjs';

const command = process.argv.slice(2);
if (!command.length) throw new Error('Usage: node scripts/prod.mjs <command>');

const envFile = resolve(mainCheckout, '.env');
const raw = process.env.PROD_DATABASE_URL || readEnv(envFile).PROD_DATABASE_URL;
if (!raw)
  throw new Error(`PROD_DATABASE_URL isn't set. Add it to ${envFile}: Railway → Postgres → Connect → Public Network.`);
// The Variables tab can copy the template, whose ${{…}} references only Railway fills in.
if (raw.includes('${{'))
  throw new Error("PROD_DATABASE_URL is Railway's template. Copy it from Connect → Public Network.");

const url = new URL(raw);
if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("PROD_DATABASE_URL isn't a postgresql:// address.");
// Without a host, pg would connect to localhost.
if (!url.hostname) throw new Error('PROD_DATABASE_URL has no host.');
// The connection crosses the internet, so it must be encrypted. Railway's certificate is
// self-signed, so it isn't verified: the same as PGSSLMODE=require in the backup workflow.
if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'no-verify');

// The API's scripts load .env too, but a variable that's already set wins over the file.
const { status, error } = spawnSync(command[0], command.slice(1), {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url.href },
});
if (error) throw error;
process.exit(status ?? 1);
