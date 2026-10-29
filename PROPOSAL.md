# feedr: design

A personal ReciMe-style app. Agents (Claude Code or any MCP client) import recipes, scale them, plan meals and read shopping lists. The iPhone app is for reading, cooking, checking the week and dishing up. There is no in-app chat.

## Principles

- **Agents use judgement; the server does arithmetic.** Scaling a recipe is a cooking decision (whole eggs, spices that don't scale linearly, bigger pans, longer times), so agents write scaled recipes. The server only does maths that really is linear: splitting a finished dish, day and week totals, and combining shopping lists.
- **Calories size the portions.** Protein is shown against each person's target; meeting it is the agent's job when choosing or adapting a version.
- **Prototype scope.** Plain styling, no warnings or guards beyond input validation.

## Model

| Table | Notes |
|---|---|
| `users`, `access_tokens` | One login for now. Personal tokens (hashed) for agents and the app; Clerk sign-in optional. |
| `people` | Who you cook for (no login): weight, daily kcal and protein targets, `slot_split` (fraction of daily kcal per slot; snack is the total for all snacks). |
| `recipes` | Who the dish is and where it came from: title, description, source, tags, image. |
| `recipe_versions` | What you actually cook. The original is the recipe as published; agents add scaled or adapted versions with notes on what changed. Each version owns its own ingredients, steps and nutrition, because step text often contains amounts and times. |
| `ingredients` | Canonical names per user, with aisle, so shopping lists combine. |
| `recipe_ingredients`, `recipe_steps` | Belong to a version. |
| `nutrition` | One row per version for the **whole batch**: kcal, protein, carbs, fat, saturates, fibre, sugar, salt, plus `extra` for micronutrients later. Source is `from_source` or `agent_estimate`. |
| `services` | One version cooked on a date, with an optional cooked weight. |
| `portions` | A share of a service: person, date, slot and `target_kcal`. Unassigned portions are leftovers. |

## Portions and dishing up

Each portion's `target_kcal` comes from the person's daily kcal × their slot fraction, unless it's given explicitly. The target is stored when the portion is planned, so later target changes don't shift a dish you've already served. A portion's share of the dish is its target divided by the sum of the service's targets, and its nutrition is that share of the version's whole batch. The batch only has to be close to the targets, because the split always uses what was actually cooked.

The **dish-up guide** splits the pot by meal first (tonight's plates, tomorrow's lunch boxes), then by person within each meal:

- each meal's share of the pot, in plain words ("just over half")
- the nearest simple ratio between the people at a meal ("4:3")
- grams per portion once the cooked weight is entered, rounded to 5 g, with the last portion taking the rest

Days, weeks and shopping lists are calculated, not stored. A shopping list combines the ingredients of every service cooked in a range (or of given versions) by ingredient and unit type, grouped by aisle.

## Interfaces

- **MCP** (`/mcp`, stateless Streamable HTTP, bearer token): people and slot targets; recipes and versions (create, update, archive); services and portions (plan, add leftovers, move, remove); `get_plan` with per-person totals against targets; `get_shopping_list` (read-only). The server instructions teach agents the model and how to scale.
- **REST** for the app: the same service layer.
- **App** tabs: Plan (week strip, day per person with kcal and protein against targets), Recipes (search, detail with version picker, cook mode), Shopping (week list by aisle with local ticks), People (targets, slot split, agent tokens).

## Running

Postgres and the API in Docker on your machine. Claude Code connects to `localhost:4100/mcp`; the Expo app on your phone connects over the LAN or Tailscale.

## Later

Visual design, hosting, Clerk OAuth for claude.ai connectors, a pantry, photos, Apple Health, more micronutrients.
