# @feedr/mobile

The feedr iPhone app: Expo SDK 58, Expo Router and React Query. The same screens run on web. It is built to the Paper design described in [`design/README.md`](../../design/README.md), with the decisions the design doesn't cover in [`design/BUILD.md`](../../design/BUILD.md).

From the repository root:

```sh
npm install
npm run dev:api
npm run dev:mobile
# or, in a browser:
npm run dev:mobile:web -- --port 8082
```

Open it in an Expo Go release that supports SDK 58. Connect with the API's LAN URL (for example `http://192.168.1.10:4100`) and a `feedr_…` personal token. `localhost` only works when the browser and the API run on the same computer. Create an account and token with `npm run account:create -- "Your name"`, then run `npm run seed -- <userId>` for sample data.

## Navigation

There is no tab bar and no native header. Home is the root of one stack, and each pushed screen draws its own top bar with a text back link.

```
Home ─┬─ Meal plan ─┬─ Recipe ─┬─ Cook mode ── Dish-up
      │             │          └─ Dish-up
      │             └─ Cookbook (pick mode)
      ├─ Cookbook ─── Recipe ── Cook mode
      ├─ Shopping list
      └─ People ───── Person
```

| Route | Screen |
|---|---|
| `/` | Home: tonight's dinner, with a button straight into cook mode, and the index. |
| `/plan` | Meal plan: seven days, who eats what, and the week switcher. It opens on today. |
| `/cookbook` | Cookbook: search and meal-type filters. With `date` and `slot` it is in pick mode, and tapping a recipe plans it for everyone at that meal. |
| `/recipe/[id]` | Recipe: the default version, or the planned one when opened with `serviceId`. |
| `/cook/[versionId]` | Cook mode, a full-screen modal: one step at a time, its ingredients and a timer. Takes `recipeId` and an optional `serviceId`. |
| `/service/[id]` | Dish-up: the cooked weight and the grams for each plate. |
| `/shopping` | Shopping list for the week in `week` (its Monday), or this week. |
| `/people`, `/people/[id]` | People, agent tokens and the connection; the person form (`new` adds one). |

Connect isn't a route. The root layout shows it until there is a saved connection.

## Structure

- `src/theme.ts`: the light and dark tokens, the type roles and the lane widths. Everything follows the system appearance.
- `src/primitives.tsx`: the components from the design (`Text`, `TopBar`, `BackLink`, `PageHead`, `PrimaryButton`, `Row` and its lanes, and so on). Screens are built from these, not from raw styles.
- `src/recipe-parts.tsx`: what the recipe page and cook mode share: ingredient rows, a step's ingredients and where they are named in its text.
- `src/plan.ts`: turns `/plan` into days, slots and dishes, each listing who eats it.
- `src/store.tsx`, `src/connect.tsx`: the API client, the connection and sign-in.
- `src/ticks.ts`, `src/dates.ts`, `src/format.ts`: shopping ticks, date helpers and display formatting.

## Things to know

- **People on the plan.** With one person the plan looks like the design, with kcal at the end of each row. With more, each dish lists who is eating it and their kcal, and the day header shows each person's total.
- **Versions.** The cookbook and pick mode use the default version: the newest adapted one, or the original. A recipe with several versions has a text action that cycles through them.
- **Ingredient terms.** Steps mark the ingredients they are linked to. A step with no links falls back to matching ingredient names in its text.
- **Timers** run only while cook mode is open. Each step keeps its own, so going back to a step shows its countdown. There is no background alarm.
- **Storage.** A personal connection is kept in SecureStore on iOS and in AsyncStorage on web. Shopping ticks are kept in AsyncStorage per server, account and week. Disconnecting clears the connection and the query cache, and leaves the ticks.
- **Fonts.** Hanken Grotesk and Geist Mono are loaded from `@expo-google-fonts` before the splash screen hides. Underline offsets only apply on web, because React Native can't move an underline on iOS.
- **Clerk.** For optional email-code sign-in, copy `.env.example` to `.env.local` in this directory and set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`. Configure the API's matching Clerk secret and turn on email codes in Clerk. Personal tokens still work. Native Clerk client sync is off because the app uses no Clerk native components.

## Checks

```sh
npm run typecheck
npm test
npm run lint -w @feedr/mobile
npm run export:web -w @feedr/mobile
```

The screens were checked on web at 390×844 in light and dark against `design/screens`; the results are in `design/build-shots`. Not yet checked on a physical iPhone: keep-awake, SecureStore, the safe-area insets and dotted underlines. Clerk sign-in is typechecked but needs a configured instance to test.
