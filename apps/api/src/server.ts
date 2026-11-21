import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { app } from './app.ts';
import { migrate } from './db.ts';

await migrate();
// One log line per request (method, path, status, time), here rather than in app.ts so the tests stay quiet.
const server = new Hono().use(logger()).route('/', app);
const port = Number(process.env.PORT ?? 4100);
serve({ fetch: server.fetch, port, hostname: '0.0.0.0' }, () => {
  console.log(`feedr API on http://0.0.0.0:${port} (MCP at /mcp)`);
});
