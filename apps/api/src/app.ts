import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z, ZodError } from 'zod';
import {
  DateRange,
  PersonInput,
  PersonUpdate,
  PortionInput,
  PortionUpdate,
  RecipeCreate,
  RecipeUpdate,
  ServiceCreate,
  ServiceUpdate,
  Slot,
  VersionInput,
  type Me,
} from '@feedr/core';
import { authenticate, createAccessToken, mcpOAuth, type AuthUser } from './auth.ts';
import { handleMcp } from './mcp.ts';
import * as svc from './service.ts';

type Env = { Variables: { user: AuthUser } };

export const app = new Hono<Env>();

app.use(
  '*',
  cors({
    origin: (origin) => origin ?? '*',
    allowHeaders: ['Authorization', 'Content-Type', 'Mcp-Session-Id', 'Mcp-Protocol-Version'],
    exposeHeaders: ['WWW-Authenticate'],
  }),
);

app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ error: 'Invalid request', issues: err.issues }, 400);
  if (err instanceof svc.NotFoundError) return c.json({ error: err.message }, 404);
  if (err instanceof svc.InvalidError) return c.json({ error: err.message }, 400);
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
});

app.get('/health', (c) => c.json({ ok: true }));

// OAuth protected-resource metadata (RFC 9728) for /mcp. A connector finds it from the 401's
// WWW-Authenticate header, then signs in with Clerk, the authorisation server it names.
app.get('/.well-known/oauth-protected-resource/mcp', (c) => {
  const oauth = mcpOAuth();
  if (!oauth) return c.json({ error: 'OAuth is not configured' }, 404);
  return c.json({
    resource: oauth.resource,
    authorization_servers: [oauth.issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: ['profile'],
    resource_name: 'feedr',
  });
});

app.use('*', async (c, next) => {
  const header = c.req.header('Authorization');
  const oauth = c.req.path === '/mcp' ? mcpOAuth() : null;
  const user = await authenticate(header, oauth?.resource);
  if (!user) {
    // Tells an MCP client where to sign in (RFC 9728 §5.1). error= tells it a token it sent was refused.
    if (oauth) {
      const error = header ? 'error="invalid_token", ' : '';
      c.header('WWW-Authenticate', `Bearer ${error}resource_metadata="${oauth.metadataUrl}"`);
    }
    return c.json({ error: 'Unauthorised' }, 401);
  }
  c.set('user', user);
  await next();
});

const uid = (c: { get: (k: 'user') => AuthUser }) => c.get('user').id;
const ids = (v: string | undefined) => (v ? v.split(',').filter(Boolean) : undefined);

app.all('/mcp', (c) => handleMcp(c, c.get('user')));

app.get('/me', (c) => {
  const { id, name, auth } = c.get('user');
  return c.json<Me>({ id, name, auth });
});
app.post('/me/tokens', async (c) => {
  const { name } = z
    .object({ name: z.string().min(1).default('Agent token') })
    .parse(await c.req.json().catch(() => ({})));
  return c.json({ token: await createAccessToken(uid(c), name) }, 201);
});

app.get('/people', async (c) => c.json(await svc.listPeople(uid(c))));
app.post('/people', async (c) => c.json(await svc.createPerson(uid(c), PersonInput.parse(await c.req.json())), 201));
app.patch('/people/:id', async (c) =>
  c.json(await svc.updatePerson(uid(c), c.req.param('id'), PersonUpdate.parse(await c.req.json()))),
);
app.delete('/people/:id', async (c) => {
  await svc.archivePerson(uid(c), c.req.param('id'));
  return c.body(null, 204);
});

app.get('/ingredients', async (c) => c.json(await svc.listIngredients(uid(c), c.req.query('q'))));

app.get('/recipes', async (c) =>
  c.json(await svc.searchRecipes(uid(c), { q: c.req.query('q'), tag: c.req.query('tag') })),
);
app.post('/recipes', async (c) => c.json(await svc.createRecipe(uid(c), RecipeCreate.parse(await c.req.json())), 201));
app.get('/recipes/:id', async (c) => c.json(await svc.getRecipe(uid(c), c.req.param('id'))));
app.patch('/recipes/:id', async (c) =>
  c.json(await svc.updateRecipe(uid(c), c.req.param('id'), RecipeUpdate.parse(await c.req.json()))),
);
app.delete('/recipes/:id', async (c) => {
  await svc.archiveRecipe(uid(c), c.req.param('id'));
  return c.body(null, 204);
});
app.post('/recipes/:id/versions', async (c) =>
  c.json(await svc.createVersion(uid(c), c.req.param('id'), VersionInput.parse(await c.req.json())), 201),
);
app.patch('/versions/:id', async (c) =>
  c.json(await svc.updateVersion(uid(c), c.req.param('id'), VersionInput.partial().parse(await c.req.json()))),
);
app.delete('/versions/:id', async (c) => {
  await svc.deleteVersion(uid(c), c.req.param('id'));
  return c.body(null, 204);
});

app.get('/slot-targets', async (c) =>
  c.json(await svc.slotTargets(uid(c), Slot.parse(c.req.query('slot')), ids(c.req.query('person_ids')))),
);

app.get('/plan', async (c) => {
  const { start, end } = DateRange.parse(c.req.query());
  return c.json(await svc.getPlan(uid(c), start, end));
});

app.post('/services', async (c) => c.json(await svc.planService(uid(c), ServiceCreate.parse(await c.req.json())), 201));
app.get('/services/:id', async (c) => c.json(await svc.getService(uid(c), c.req.param('id'))));
app.patch('/services/:id', async (c) =>
  c.json(await svc.updateService(uid(c), c.req.param('id'), ServiceUpdate.parse(await c.req.json()))),
);
app.delete('/services/:id', async (c) => {
  await svc.deleteService(uid(c), c.req.param('id'));
  return c.body(null, 204);
});
app.post('/services/:id/portions', async (c) =>
  c.json(
    await svc.addPortions(
      uid(c),
      c.req.param('id'),
      z
        .array(PortionInput)
        .min(1)
        .parse(await c.req.json()),
    ),
  ),
);
app.patch('/portions/:id', async (c) =>
  c.json(await svc.updatePortion(uid(c), c.req.param('id'), PortionUpdate.parse(await c.req.json()))),
);
app.delete('/portions/:id', async (c) => c.json({ service: await svc.removePortion(uid(c), c.req.param('id')) }));

app.get('/shopping', async (c) => {
  const versionIds = ids(c.req.query('version_ids'));
  if (versionIds) return c.json(await svc.shoppingList(uid(c), { version_ids: versionIds }));
  return c.json(await svc.shoppingList(uid(c), DateRange.parse(c.req.query())));
});
