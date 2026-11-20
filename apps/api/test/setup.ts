// Loaded before each API test file (see the test script). The tests get a database of their
// own, so they never touch your dev data: TEST_DATABASE_URL, or feedr_test on the compose
// Postgres. It is created on the first run.
import pg from 'pg';

const url = new URL(process.env.TEST_DATABASE_URL ?? 'postgres://feedr:feedr@127.0.0.1:55433/feedr_test');
process.env.DATABASE_URL = url.href;

const name = decodeURIComponent(url.pathname.slice(1));
const server = new URL(url);
server.pathname = '/postgres';
const client = new pg.Client({ connectionString: server.href });
await client.connect();
try {
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (!rowCount) await client.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
} finally {
  await client.end();
}
