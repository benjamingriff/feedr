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

Open it in an Expo Go release that supports SDK 58. Run `./scripts/setup.sh` from the repo root first: it writes `.env.local` here with the Clerk publishable key and `EXPO_PUBLIC_API_URL`, which the app bakes in when Metro bundles it (restart with `--clear` after changing them). The Sign in screen has nothing to type: just "Continue with Apple" and "Continue with Google". A production build sets the same two variables to the production Clerk key and `https://` API in its build environment.

## Navigation

There is no tab bar and no native header. Home is the root of one stack, and each pushed screen draws its own top bar with a text back link.

```
Home ─┬─ Meal plan ─┬─ Recipe ─┬─ Cook mode ── Dish-up
      │             │          └─ Dish-up
      │             └─ Cookbook (pick mode)
      ├─ Cookbook ─── Recipe ── Cook mode
      ├─ Shopping list
      ├─ People ───── Person
      └─ Account ─┬─ Appearance
                  ├─ Invite to your home
                  └─ Delete account
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
| `/people`, `/people/[id]` | People; the person form (`new` adds one). |
| `/account` | Account: profile, your home, settings, agent tokens, sign out and delete. Households, the cooking and reminder settings, export and delete are mocks for now. |
| `/appearance` | Colour palette and light or dark mode, opened from Account. |
| `/account/invite`, `/account/delete` | Invite someone to your home (a mock); confirm deleting the account. |

Sign in (`src/connect.tsx`) isn't a route. The root layout shows it until there is a signed-in account.

## Structure

- `src/theme.ts`: the light and dark tokens, the type roles and the lane widths. Everything follows the system appearance.
- `src/primitives.tsx`: the components from the design (`Text`, `TopBar`, `BackLink`, `PageHead`, `PrimaryButton`, `Row` and its lanes, and so on). Screens are built from these, not from raw styles.
- `src/recipe-parts.tsx`: what the recipe page and cook mode share: ingredient rows, a step's ingredients and where they are named in its text.
- `src/account-parts.tsx`: the account monogram and settings row that Account and its screens share.
- `src/plan.ts`: turns `/plan` into days, slots and dishes, each listing who eats it.
- `src/store.tsx`, `src/connect.tsx`: the API client, the signed-in account and sign-in.
- `src/ticks.ts`, `src/dates.ts`, `src/format.ts`: shopping ticks, date helpers and display formatting.

## Things to know

- **People on the plan.** With one person the plan looks like the design, with kcal at the end of each row. With more, each dish lists who is eating it and their kcal, and the day header shows each person's total.
- **Versions.** The cookbook and pick mode use the default version: the newest adapted one, or the original. A recipe with several versions has a text action that cycles through them.
- **Ingredient terms.** Steps mark the ingredients they are linked to. A step with no links falls back to matching ingredient names in its text.
- **Timers** run only while cook mode is open. Each step keeps its own, so going back to a step shows its countdown. There is no background alarm.
- **Storage.** The signed-in account id is kept in SecureStore on iOS and in AsyncStorage on web; the session itself is Clerk's. Shopping ticks are kept in AsyncStorage per API, account and week. Signing out clears the account, the session and the query cache, and leaves the ticks.
- **Fonts.** Hanken Grotesk and Geist Mono are loaded from `@expo-google-fonts` before the splash screen hides, with Google Sans Medium for the Google button only. Underline offsets only apply on web, because React Native can't move an underline on iOS.
- **Clerk.** Apple and Google sign-in through `useSSO` (a browser flow, so it works in Expo Go), set up by `scripts/setup.sh` (keys in `.env.local`, see `.env.example`). The wizard allowlists the Expo Go redirect `exp://<LAN IP>:8081/--/sso-callback` in Clerk. Without a publishable key or `EXPO_PUBLIC_API_URL` the Sign in screen says sign-in isn't available. Personal tokens are for agents only; the app doesn't sign in with them. Native Clerk client sync is off because the app uses no Clerk native components.
- **Sign-in buttons.** feedr offers Sign in with Apple alongside Google to meet the App Store's login rule (guideline 4.8), and both companies set rules for custom buttons. "Continue with Apple" and "Continue with Google" follow them: logos from Apple's and Google's own kits (`assets/sign-in`), the brands' fixed colours and fonts, an Apple title at 43% of the 44 height, and the same size and weight for both. They are the one place the app's tokens and type roles don't apply; the comment on `BrandButton` lists each rule.

## Checks

```sh
npm run typecheck
npm test
npm run lint -w @feedr/mobile
npm run export:web -w @feedr/mobile
```

The screens were checked on web at 390×844 in light and dark against `design/screens`; the results are in `design/build-shots`. Not yet checked on a physical iPhone: keep-awake, SecureStore, the safe-area insets and dotted underlines. Clerk sign-in is typechecked but needs a configured instance to test.
