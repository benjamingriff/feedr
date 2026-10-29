import { serve } from '@hono/node-server';
import { app } from './app.ts';
import { migrate } from './db.ts';

await migrate();
const port = Number(process.env.PORT ?? 4100);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  console.log(`feedr API on http://0.0.0.0:${port} (MCP at /mcp)`);
});
