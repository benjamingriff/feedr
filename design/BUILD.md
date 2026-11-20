# Mobile build: decisions for the first pass

`README.md` in this folder says how things look. This file says what to build where the
design is silent or the data doesn't fit it.

**The Paper design is the target.** The app should look like it. When real data doesn't
fit a layout, adapt it using the same tokens, lanes and components, and don't invent new
visual ideas.

**The current app is throwaway.** It's an early prototype, and none of its code or UI is
precious. Keep what's genuinely useful (the API client, query hooks, the date helpers) and
delete or rewrite everything else, especially anything shaped by the old tab layout or
styling. Don't preserve old behaviour or storage formats for compatibility; the features
listed here are what matters.

## Scope

- Rebuild `apps/mobile` to the design: Home, Meal plan, Cookbook, Recipe, Cook mode and
  Shopping list. Also build People, Dish-up and Connect, which have no design yet, from
  the same components.
- Make the small API and core additions listed under **Data changes**. Don't make other
  backend changes.
- Not in scope: logins per person, households or merging accounts, images, recipe editing,
  push notifications, and landscape.

## App shell

- **Theme.** Follow the system appearance: set `userInterfaceStyle: "automatic"` in
  `app.json`. Put the light and dark tokens in one theme module and read them with
  `useColorScheme`. Every screen must work in both.
- **Fonts.** Load Hanken Grotesk and Geist Mono (400, 500 and 600) with the
  `@expo-google-fonts` packages, and hold the splash screen until they're loaded. Both
  packages work in Expo Go.
- **Navigation.**
  - Delete `(tabs)`. Home is the stack root.
  - Every route has `headerShown: false`, and screens draw their own top bar with a
    safe-area top inset.
  - Cook mode is a `fullScreenModal`.
- **Primitives.** Delete `ui.tsx` and write a small set of primitives taken from the
  README's Components section: `Text` variants for each type role, `TopBar`, `BackLink`,
  `PageHead`, `PrimaryButton`, `SquareButton`, `TextAction`, `Chip`, `GroupLabel`,
  `SectionHeader`, `Row` (with the 92, 64, 36, 32 and 20 lane slots) and `Hairline`.
  Screens should be built from these, not from raw styles.
- **Loading, empty and error states.** Use one 12 mono caps ink3 line, for example
  "Loading…", "Nothing planned", or "Couldn't reach the API · Retry". An error line has a
  `TextAction` retry. Keep pull-to-refresh on scrolling screens.

## People on the plan

An account has one or more people. **The UI shows who is eating what.** With one person,
it looks exactly like the design. With more than one:

- **Day header.** The first row is the day name, the date and "· Today", with nothing on
  the right. Under it, 4 apart, the people's totals sit side by side on one line in the
  same format as a meal row: "Ben 1,640 · Jess 1,420 kcal" in 13 mono ink2. If the day isn't
  fully planned, the line turns ink3 and ends "so far".
- **Meal row.** Group the row by service, so a dish shared by everyone is one row. The
  second line (14 ink3) lists who's eating it with their portion kcal: "Ben 700 · Jess 520".
  Drop the 64 kcal lane, because the numbers live on that line. A leftovers note
  ("Leftovers from Monday") goes on its own line below.
- **Different meals in the same slot.** If people eat different things in one slot, each
  dish gets its own row under that slot, and each row lists only its own eaters.
- **Page subtitle.** "N meals left to plan · for Ben and Jess".
- **Home Tonight.** The right meta becomes "Dinner · Ben 700 · Jess 520".

Supporting rules:

- **Empty slots.** Breakfast, lunch and dinner always show a row. A slot nobody has a meal
  in shows "+ Add dinner" and counts towards "meals left to plan". A snack row appears only
  when a snack is planned.
- **The data.** `/plan` already returns each person's meals and totals, so this needs no
  API change.

## Screens

**Home.**
- Tonight is today's dinner from `/plan`. If people have different dinners, use the one
  most people are eating.
- "Start cooking" opens cook mode for that service's version and passes `serviceId` along.
- Each index subline is live: the week's range and how many meals are left to plan; the
  recipe count; the shopping item count and how many are ticked (read from AsyncStorage);
  and people's names joined with "and".

**Meal plan.**
- Show seven day sections, Monday to Sunday. On the current week, scroll to today when
  the screen opens.
- The week switcher in the top bar changes the week.
- Tapping a meal opens the Recipe for that version and passes `serviceId`.
- "+ Add <slot>" opens the Cookbook in pick mode (see below).

**Cookbook.**
- **Search row.** Above the filter tabs, add a search row: a full-width text input in
  17 sans ink, placeholder "Search" in ink3, with hairlines above and below and no box.
  Debounce it 250 ms and pass it to `/recipes?q=`.
- **Filter tabs.** Count recipes by tag: a recipe is "Dinner" if it has a `dinner` tag
  (case-insensitive).
- **Row meta.** Use the recipe's default version: total time ("1 hr", "35 min"),
  "Serves N" and kcal per serving.
- **Pick mode.**
  - It's opened from the plan with `date` and `slot`. The title becomes "Add dinner" with
    the subtitle "Tue 18 Nov".
  - Tapping a row plans that recipe's default version for that date and slot, for every
    person, with `POST /services`. Let the server work out the portion targets.
  - Then go back to the plan and refetch.

**Recipe.**
- **Which version.**
  - Show the version passed in as a param (from the plan or Tonight). Otherwise show the
    default version.
  - If the recipe has more than one version, add one 12 mono caps ink2 `TextAction` under
    the agent note, such as "2 versions · Original →". It cycles to the next version.
- **Hero and meta.**
  - Chips are the tags, the standfirst is the description, and the agent note is
    `version.notes` with the label "Agent note · For {servings}".
  - Leave out the note if it's empty.
  - The meta row shows servings, prep, cook, and kcal per serving.
- **Ingredients.** Group them by `section`. The quantity is
  `quantity + unit` at API precision, falling back to `raw_text`. The prep line is
  `preparation`, and "Optional" is a tag.
- **Method.**
  - Show the steps with their timer chips.
  - Mark ingredient terms using the step links (see Data changes), falling back to the name
    match.
- **Footer.**
  - Per serving is the batch nutrition divided by servings. Show kcal, protein, carbs and
    fat, plus "[agent estimate]" when `source` is `agent_estimate`.
  - The source footer reads "Adapted from <source_name or host>" as a link, then "Added on
    <created>; last changed <updated>".
- **Dish-up.** When the page was opened with a `serviceId`, add a `TextAction` "Dish up →"
  after the primary button.

**Cook mode.**
- **Layout.** Follow the design. The progress bar has one segment per step, keep-awake
  stays on, and Close dismisses the modal.
- **Step text and terms.**
  - Mark each ingredient term in the step text.
  - Tapping a term toggles that ingredient's row as highlighted in "For this step".
  - Durations, matched with a regex such as `8–10 min`, `1 hr` or `30 seconds`, are weight
    600.
- **"For this step".**
  - List the step's linked ingredients, with the per-step amount if one is set.
  - The highlighted row's prep line adds "· 4 of 6, 2 for step 05" only when per-step
    amounts exist. Otherwise it shows the prep line alone.
  - If a step has no links and the name match finds nothing, leave out the section.
- **Timer.**
  - When a step has `timer_seconds`, show a timer chip under the step text:
    "◷ Timer · 12 min".
  - Tapping it starts a countdown in the chip ("◷ 11:42"), and tapping again pauses it.
  - When it finishes, the chip turns accent and reads "◷ Done". The timer runs only while
    this screen is open.
- **Last step.** The primary button reads "Finish · Dish up →" when there's a `serviceId`,
  and "Finish →" otherwise. It closes cook mode.

**Shopping list.** Follow the design.
- The week comes from a `week` param (its Monday) and defaults to the current week. The
  range in the top bar isn't tappable.
- Ticks stay in AsyncStorage, keyed by API, account and week.
- Ticked rows stay in place.
- The "Clear ticks" text action is disabled when nothing is ticked.

**Dish-up** (`service/[id]`). Enter the cooked weight and get grams per plate, laid out in
the design language:
- The top bar has "← Back" on the left.
- The page head is the recipe title, with "Cooked Tue 18 Nov · <version label>" as the
  lede.
- A "Cooked weight" section holds a hairline-ruled numeric input with a "g" suffix in
  mono, and a `PrimaryButton` "Save weight".
- Each meal is a group label ("Tonight · Dinner", "Wed · Lunch"), with a mono caps meta line
  for its share and ratio.
- Each portion is a row: `[92 grams, mono, large]`, then the person's name (17/500), then
  "38% of this meal · 640 kcal · 42 g protein" in 14 ink3.
- Remove is a `TextAction` that asks for confirmation.

**People**.
- **Page head.** "People" with the lede "Who you cook for."
- **People list.** Each person is a row with their name (17/500) and
  "2,400 kcal · 150 g protein a day" in 14 ink3. A trailing "→" opens the edit form. Below
  the list, a `TextAction` "+ Add person".
- **Edit form.** The form is a pushed screen with hairline-ruled fields: the label in 12
  mono caps ink3, the input in 17 sans ink, and no boxes. It covers name, weight, daily
  kcal, daily protein and the slot split. "Save" is a `PrimaryButton` and "Delete" is a
  `TextAction`.

**Account**. Home's index row 05. Sections are 44 apart, each under a ruled `SectionHeader`.
Settings rows are hairline rows: title (17/500) with an optional 14 ink3 detail, then a
value, a control or "→".
- **Top bar.** "← Home" on the left and "Account" in mono caps on the right.
- **Profile.** A 64 square in `accentFill` with the initials in `onAccent`, the name as the
  page title, the Clerk email in body ink2, then "ID 408AF10B" in mono caps with a
  `TextAction` "Copy ID".
- **Your home.** "Your home" / "1 person", then a numbered row per member ("You · owner"), a
  note on what a shared home means, a `PrimaryButton` "Invite to your home" and a
  `TextAction` "Got an invite? Join a home". Households aren't built: only you are listed.
- **Appearance.** One row, "Colour and mode", with the palette and mode as its detail and the
  `PaletteSwatch` before the arrow. It opens `/appearance`.
- **Cooking** and **Timers & reminders** ("Coming soon"). Keep screen on, units, week start,
  default servings, the timer alarm and two reminders. A switch is a square 40×22 `Toggle`,
  filled `accentFill` with an `onAccent` knob when on. These are mocks that hold local state.
- **Agent access.** A section with a `PrimaryButton` "Create token". Once a token exists,
  show the token and the `claude mcp add` command in mono, with copy actions.
- **Sign-in & data.** Meta "Signed in with Google" (or Apple). Rows: "Export my data" (a
  mock), "Sign out", and "Delete account" in accent.

**Invite to your home** (`/account/invite`, a mock). Page head, a "Username or ID" field and
the person it found (an outlined 40 square, name, handle, "Found"). Then "What you'll share",
four numbered rows, a note that logins and tokens stay separate, and a `PrimaryButton`
"Send invite to Jess". Sending switches the head to "Invite sent", the tag to "Pending", and
offers "Cancel invite".

**Delete account** (`/account/delete`). Page head with "It can't be undone", "What goes" with
four numbered rows (live recipe and people counts), an export prompt, a "Type DELETE to
confirm" field and a `PrimaryButton` "Delete my account" that stays disabled until it says
DELETE, then "Keep my account". There is no delete endpoint yet, so the button does nothing.

**Sign in** (Connect).
- **Page head.** "Sign in" with the lede "Your meal plan, cookbook and shopping list, kept up
  to date by your agent."
- **Actions.** When Clerk is configured, "Continue with Apple" and "Continue with Google",
  stacked 12 apart. These are the one exception to the tokens and type roles: Apple and Google
  set the logo, colours, fonts and proportions, and Apple is there to meet the App Store's
  login rule (guideline 4.8). Both are 44 high, full width, white with a 1px `#747775` stroke, square
  corners, logos on one axis. Progress shows as a mono caps line under them, since the brands'
  titles can't change. Under them: "Your first sign-in creates your feedr account."
- **No fields.** The API address and Clerk key come from the build's environment
  (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`), so local dev and production
  builds each point at their own API. The app has no personal-token sign-in; tokens are for
  agents. A build missing either value shows one state line, "Sign-in isn't available right
  now", in place of the buttons.

## Data changes

1. **Default version.** Add `defaultVersion(versions)` to core: the newest non-original
   version, or else the original. Use it on the cookbook, recipe and pick mode, and test it.
2. **Recipe summary minutes.** Add `prep_minutes` and `cook_minutes` to
   `RecipeSummary.versions`.
3. **Step ingredients.**
   - Add a `step_ingredients` table with `step_id`, `ingredient_line_id`, and an optional
     `quantity` and `unit` for the amount used in that step. Write it as a new migration.
   - Expose it as `Step.ingredients: { line_id: string; quantity: number | null; unit: string | null }[]`.
   - In the MCP create and update tools, each step takes an optional
     `ingredients: [{ line: <index into this version's ingredients>, quantity?, unit? }]`.
   - Update the MCP instructions to ask agents to link ingredients to steps, and to tag
     recipes with the meal type (breakfast, lunch or dinner).
   - Add an API test for creating a version with step links and reading it back.
4. **Name-match fallback.** Put a pure function in core that finds where ingredient names
   appear in a step's text: case-insensitive, matching plurals ("onion" and "onions") and
   the last word of the name ("chicken breasts" matches "chicken"). It returns character
   ranges. Test it, because cook mode and the Recipe method both depend on it.
5. **Seed data.** Update the seed so it shows the design: two people; a week with
   breakfast, lunch and dinner on most days, a leftover lunch and one empty dinner; and a
   katsu curry with sections, prep lines, an optional ingredient, step links with per-step
   garlic amounts, and timers.

## Done means

- `npm run typecheck` and `npm test` pass.
- **Screenshots.** Run the API (Docker Postgres, migrate, seed) and the app on web at
  390×844, with `npm run dev:mobile:web` and the preview tools. Screenshot every designed
  screen in light and dark, and compare each with `design/screens`. Fix anything that
  differs in spacing, type, lanes, hairlines or colour. Also screenshot People, Dish-up,
  Connect, pick mode, and a two-person plan.
- **README.** `apps/mobile/README.md` and the root README match the new navigation.
- **Report.** Say what differs from the design and why, and list anything left undone.
