# feedr

A personal recipe, cooking and meal-planning app for iPhone. Agents create recipes and plans over MCP; the app is for reading recipes, cooking, checking the week and dishing up.

- `apps/api`: Hono REST API and MCP server (`/mcp`) over one service layer, Postgres via Kysely
- `apps/mobile`: Expo Router app (runs in Expo Go), built to the design in [`design/`](design/README.md)
- `packages/core`: shared schemas, types and the portion, dish-up and shopping maths

See [PROPOSAL.md](PROPOSAL.md) for the design.

## Run locally

Requires [mise](https://mise.jdx.dev) (or Node 24 with `corepack enable`), Docker, jq and an iPhone with Expo Go. mise installs the Node and pnpm in `mise.toml` once you `mise trust` the checkout; the wizard does that. Run the setup wizard and follow it:

```bash
./scripts/setup.sh
```

It takes about five minutes and says at every stage what it's doing and what, if anything, you need to do. It installs packages and sets up Postgres, then uses the Clerk CLI to create a Clerk app called "feedr" with Apple and Google sign-in, writing the keys to `.env` and `apps/mobile/.env.local`. It saves the address your phone uses for the API, starts the API, and waits while you sign in with Apple or Google on your phone. Finally it offers to load demo data. Re-running it is safe: finished steps are detected and skipped.

In a new git worktree, `pnpm dev:setup` copies the `.env` files from the main checkout, leaving out `PROD_DATABASE_URL` and any live Clerk key.

Day to day, once setup is done:

```bash
pnpm dev:api        # or: docker compose up -d api
pnpm dev:mobile     # scan the QR code with the Camera app to open it in Expo Go
pnpm dev:mobile:tunnel  # the same through Expo's tunnel, when a firewall blocks the phone (needs `npx expo login`)
```

Your phone still needs to reach the API on this computer (port 4100); the tunnel only carries the app. The app talks to the API over plain HTTP, so on a network you don't control, anyone else on it can read your session or token: use the Tailscale address there, which is encrypted. To run the app in a browser, use `pnpm dev:mobile:web`.

The app has no settings screen for where the API lives. It reads `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` when Metro bundles it: from `apps/mobile/.env.local` locally, and from the build environment for a production build, which uses the production `https://` API and Clerk key.

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
- **People** holds each person's targets.
- **Account** shows who's signed in and holds the settings, agent tokens, sign out and account deletion. Shared homes are mocked there for now.

The app follows the system's light or dark appearance unless you pin one, and offers five colour palettes, under Account → Colour and mode.

## Deploy

The API and Postgres run on Railway, which deploys each commit on `main` once CI passes. Phones get changes when you run **Release** in GitHub Actions: an over-the-air update when only JavaScript changed, or a TestFlight build when native code did (a PR that needs one gets the `native change` label). `./scripts/deploy-setup.sh` sets up the accounts this needs; it's safe to re-run.

## Connect an agent (MCP)

```bash
claude mcp add --transport http feedr http://localhost:4100/mcp \
  --header "Authorization: Bearer feedr_…"
```

Then, for example: "Import https://… into feedr and plan it for dinner on Monday for both of us, then leftovers for Tuesday lunch." The server's MCP instructions explain versions, whole-batch nutrition and portions to the agent, and ask it to tag recipes with a meal type and link each step to the ingredients it uses.

`FEEDR_TOKEN=feedr_… pnpm smoke:mcp` walks the main tools with the official MCP client against a running API.

## Personal tokens

Agents connect with personal tokens; the app itself signs in with Apple or Google. Create a token for your account in the app under Account → Agent access. From the command line, `pnpm account:create "Token name" <userId>` adds a token to an existing account, and `pnpm account:create "Your name"` makes a new account and prints its first token once. That new account has no Apple or Google login, so the app can't open it, and what an agent adds there won't show in the app. Only the token's SHA-256 hash is stored.

## Seed or empty an account

```bash
pnpm account:list            # every account: its id, its login and how much it holds
pnpm seed <userId>           # the demo data: two people, nine recipes and this week's plan
pnpm account:nuke <userId>   # deletes all of an account's data, after you type "nuke"
```

Seeding only fills an empty account, so nuke first to start again. Nuking keeps the account itself, so your Apple or Google sign-in and agent tokens still work afterwards.

These use the local database. The `prod:` versions do the same to the production database:

```bash
pnpm prod:account:list
pnpm prod:seed <userId>
pnpm prod:account:nuke <userId>
```

They read `PROD_DATABASE_URL` from the main checkout's `.env` (copy it from Railway → Postgres → Connect → Public Network), so the address lives in one file and works from any worktree. They connect over TLS unless the address sets its own `sslmode`, and if the address isn't set they stop rather than use the local database.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm format:check  # pnpm format fixes it
pnpm test          # core unit tests + API integration tests (needs Postgres)
```
