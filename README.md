# feedr

A personal recipe, cooking and meal-planning app for iPhone. Agents create recipes and plans over MCP; the app is for reading recipes, cooking, checking the week and dishing up.

- `apps/api`: Hono REST API and MCP server (`/mcp`) over one service layer, Postgres via Kysely
- `apps/mobile`: Expo Router app (runs in Expo Go), built to the design in [`design/`](design/README.md)
- `packages/core`: shared schemas, types and the portion, dish-up and shopping maths

See [PROPOSAL.md](PROPOSAL.md) for the design.

## Run locally

Requires Node 24, Docker, jq and an iPhone with Expo Go. Run the setup wizard and follow it:

```bash
./scripts/setup.sh
```

It takes about five minutes and says at every stage what it's doing and what, if anything, you need to do. It installs packages and sets up Postgres, then uses the Clerk CLI to create a Clerk app called "feedr" with Google sign-in, writing the keys to `.env` and `apps/mobile/.env.local`. It saves the address your phone uses for the API, starts the API, and waits while you sign in with Google on your phone. Finally it offers to load demo data. Re-running it is safe: finished steps are detected and skipped.

Day to day, once setup is done:

```bash
npm run dev:api        # or: docker compose up -d api
npm run dev:mobile     # scan the QR code with the Camera app to open it in Expo Go
```

Google sign-in needs your phone on the same Wi-Fi as this computer, without Expo's `--tunnel`, because Clerk only sends the sign-in back to the Expo Go address the wizard allowed. To run the app in a browser, use `npm run dev:mobile:web`.

There is no tab bar. Home shows tonight's dinner, with a button straight into cook mode, above an index of the four sections:

```
Home ─┬─ Meal plan ── Recipe ── Cook mode ── Dish-up
      ├─ Cookbook ─── Recipe ── Cook mode
      ├─ Shopping list
      └─ People
```

- **Meal plan** is the week, day by day, with who is eating what. "+ Add dinner" opens the cookbook to pick a recipe for that meal.
- **Cookbook** lists recipes with search and meal-type filters. Agents write the recipes; the app only reads them.
- **Cook mode** shows one step at a time with that step's ingredients and a timer. Finishing a planned meal leads to **Dish-up**, which turns the cooked weight into grams per plate.
- **Shopping list** is the week's ingredients by aisle. Ticks are kept on the phone.
- **People** holds each person's targets, agent tokens and the connection.

The app follows the system's light or dark appearance.

## Connect an agent (MCP)

```bash
claude mcp add --transport http feedr http://localhost:4100/mcp \
  --header "Authorization: Bearer feedr_…"
```

Then, for example: "Import https://… into feedr and plan it for dinner on Monday for both of us, then leftovers for Tuesday lunch." The server's MCP instructions explain versions, whole-batch nutrition and portions to the agent, and ask it to tag recipes with a meal type and link each step to the ingredients it uses.

`FEEDR_TOKEN=feedr_… npm run smoke:mcp` walks the main tools with the official MCP client against a running API.

## Personal tokens

Agents connect with personal tokens, and the app accepts them too. Create one in the app under People → Agent access, or from the command line: `npm run account:create -- "Your name"` makes a new account and prints its first token once, and `npm run account:create -- "Token name" <userId>` adds a token to an existing account. Only the token's SHA-256 hash is stored.

## Checks

```bash
npm run typecheck
npm test            # core unit tests + API integration tests (needs Postgres)
```
