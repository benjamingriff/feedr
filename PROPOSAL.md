# feedr: design

A personal ReciMe-style app. Agents (Claude Code or any MCP client) import recipes, scale them, plan meals and read shopping lists. The iPhone app is for reading, cooking, checking the week and dishing up. There is no in-app chat.

## Principles

- **Agents use judgement; the server does arithmetic.** Scaling a recipe is a cooking decision (whole eggs, spices that don't scale linearly, bigger pans, longer times), so agents write scaled recipes. The server only does maths that really is linear: splitting a finished dish, day and week totals, and combining shopping lists.
- **Calories size the portions.** Protein is shown against each person's target; meeting it is the agent's job when choosing or adapting a version.
- **Prototype scope.** No warnings or guards beyond input validation. The app follows the design in [`design/`](design/README.md).

## Model

| Table | Notes |
|---|---|
| `users`, `access_tokens` | One login for now, through Clerk (the app's Apple or Google sign-in, or a connector's OAuth). Personal tokens (hashed) for Claude Code and scripts. |
| `people` | Who you cook for (no login): weight, daily kcal and protein targets, `slot_split` (fraction of daily kcal per slot; snack is the total for all snacks). |
| `recipes` | Who the dish is and where it came from: title, description, source, tags, image. |
| `recipe_versions` | What you actually cook. The original is the recipe as published; agents add scaled or adapted versions with notes on what changed. Each version owns its own ingredients, steps and nutrition, because step text often contains amounts and times. |
| `ingredients` | Canonical names per user, with aisle, so shopping lists combine. |
| `recipe_ingredients`, `recipe_steps` | Belong to a version. |
| `step_ingredients` | Which ingredient lines a step uses, with the amount when a step uses only part of a line. Cook mode lists them beside the step. |
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

- **MCP** (`/mcp`, stateless Streamable HTTP, bearer token: a Clerk OAuth token for connectors such as claude.ai, whose audience must be the `/mcp` URL, or a personal token): people and slot targets; recipes and versions (create, update, archive); services and portions (plan, add leftovers, move, remove); `get_plan` with per-person totals against targets; `get_shopping_list` (read-only). The server instructions teach agents the model and how to scale.
- **REST** for the app: the same service layer.
- **App**: Home (tonight's dinner and an index) is the root of one stack, with no tab bar. From it: Meal plan (a week of days, who eats what, and adding meals from the cookbook), Cookbook (search, meal-type filters, recipe pages and cook mode), Shopping list (the week by aisle with local ticks), People (targets and slot split) and Account (settings, with agent tokens hidden behind a long-press). Dish-up follows cooking a planned meal.

## Running

Postgres and the API in Docker on your machine. Claude Code connects to `localhost:4100/mcp`; the Expo app on your phone connects over the LAN or Tailscale. The API is plain HTTP, so on the LAN anyone else on the network can read the session or token; Tailscale is encrypted, so use it on networks you don't control.

## Later

Hosting, a pantry, photos, Apple Health, more micronutrients.
