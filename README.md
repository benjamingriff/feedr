# feedr

A personal recipe, cooking and meal-planning app for iPhone. Agents create recipes and plans over MCP; the app is for reading recipes, cooking, checking the week and dishing up.

- `apps/api`: Hono REST API and MCP server (`/mcp`) over one service layer, Postgres via Kysely
- `apps/mobile`: Expo Router app (runs in Expo Go)
- `packages/core`: shared schemas, types and the portion, dish-up and shopping maths

See [PROPOSAL.md](PROPOSAL.md) for the design.

## Run locally

Requires Node 24 and Docker.

```bash
npm install
cp .env.example .env
docker compose up -d postgres
npm run db:migrate
npm run account:create -- "Your name"      # prints userId and a personal token, once
npm run seed -- <userId>                    # optional sample people, recipes and this week's plan
npm run dev:api                             # http://0.0.0.0:4100
```

Only the token's SHA-256 hash is stored. Run `npm run account:create -- "Token name" <userId>` for another token for the same account, or create one in the app under People → Agent access.

To run the API in Docker as well: `docker compose up -d --build`. It listens on port 4100 on all interfaces so your phone can reach it; every route except `/health` needs a token.

## App on your iPhone

```bash
npm run dev:mobile
```

Scan the QR code with the Camera app to open it in Expo Go. On the Connect screen, enter `http://<your computer's LAN IP>:4100` and your token. The phone and computer need to be on the same network (or use Tailscale).

## Connect an agent (MCP)

```bash
claude mcp add --transport http feedr http://localhost:4100/mcp \
  --header "Authorization: Bearer feedr_…"
```

Then, for example: "Import https://… into feedr and plan it for dinner on Monday for both of us, then leftovers for Tuesday lunch." The server's MCP instructions explain versions, whole-batch nutrition and portions to the agent.

`FEEDR_TOKEN=feedr_… npm run smoke:mcp` walks the main tools with the official MCP client against a running API.

## Clerk (optional)

Personal tokens always work. To sign in to the app with Clerk, set `CLERK_SECRET_KEY` in `.env` (API) and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` for the app. The first Clerk sign-in creates a feedr user, and that user can create agent tokens in the app.

## Checks

```bash
npm run typecheck
npm test            # core unit tests + API integration tests (needs Postgres)
```
