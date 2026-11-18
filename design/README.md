# Feedr mobile design spec

For build decisions where this spec is silent (more than one person, versions, data
changes, the screens with no design), see [BUILD.md](BUILD.md).

The source designs live in Paper (file "Feedr"). Build from this file and the PNGs in
`screens/`. The values below are exact: they were read from the Paper file, not from the
images. Use the PNGs to check how things look, never to measure.

Paper writes web CSS. When building in React Native:

- Convert `em` letter-spacing to px by multiplying by the font size. For example,
  `0.02em` at 12px is `0.24`.
- Every frame is a flex column unless it says "row".
- Borders are 1px hairlines unless stated otherwise.
- Corners are square everywhere: no `borderRadius`.

## Screens

| Screen | Light | Dark |
|---|---|---|
| Home | `screens/home-light.png` | `screens/home-dark.png` |
| Meal plan | `screens/plan-light.png` | `screens/plan-dark.png` |
| Cookbook | `screens/cookbook-light.png` | `screens/cookbook-dark.png` |
| Recipe | `screens/recipe-light.png` | `screens/recipe-dark.png` |
| Cook mode (one step) | `screens/cook-step-light.png` | `screens/cook-step-dark.png` |
| Shopping list | `screens/shopping-light.png` | `screens/shopping-dark.png` |

## Navigation

There is no tab bar. Home is the root of a single stack:

```
Home ─┬─ Meal plan ── Recipe ── Cook mode
      ├─ Cookbook ─── Recipe ── Cook mode
      ├─ Shopping list
      └─ People
```

- Each pushed screen has a text back link at the top left ("← Home", "← Recipes"), not a
  native header.
- Cook mode is full screen and has "Close ✕" at the top right.
- Home's Tonight button goes straight to cook mode for tonight's dinner.

This replaces `apps/mobile/src/app/(tabs)`. People has no design yet; reuse the list
patterns below for it.

## Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#faf9f5` | `#141413` | Screen background |
| `bgRaised` | `#f1efe8` | `#22211f` | Popovers (not used on current screens) |
| `ink` | `#141413` | `#faf9f5` | Titles, item names, primary text |
| `ink2` | `#4c4b45` | `#b0aea5` | Body copy, quantities, back link |
| `ink3` | `#7b7a72` | `#87867f` | Secondary lines, mono labels, checkbox outline, ticked items |
| `line` | `#1414131c` | `#faf9f51c` | Hairlines, chip outlines |
| `accent` | `#c15f3c` | `#d97757` | Brand square, numbers, aisle and section labels, primary button, today, ticks |

Accent tint (the highlighted ingredient row in cook mode) is `accent` at 9% opacity.

These are the **Clay** palette, the default. People can switch to Basil, Cobalt, Yolk or
Beetroot, and pin light or dark, from the Appearance settings; every palette's values live in
`apps/mobile/src/theme.ts`. Two roles sit beside `accent` so a palette's fill colour can differ
from its text colour (Yolk's yellow can't be read on white):

| Token | Use |
|---|---|
| `accentFill` | Primary button, brand square, ticked checkbox, cook-mode progress. Defaults to `accent`. |
| `onAccent` | Text and arrows on `accentFill`. Defaults to `bg`. |

The status bar style is dark-content in light mode and light-content in dark mode.

## Type

There are two families: **Hanken Grotesk** (sans) and **Geist Mono** (mono). Both are on
Google Fonts. Load them with `@expo-google-fonts/hanken-grotesk` and
`@expo-google-fonts/geist-mono`. Weights used: 400, 500, 600.

Mono labels are always uppercase and use `0.02em` tracking, unless a row says otherwise.

| Role | Family | Size / line height | Weight | Tracking | Colour |
|---|---|---|---|---|---|
| Page title | sans | 34 / 40 | 500 | −0.02em | ink |
| Index title (Home) | sans | 26 / 32 | 500 | −0.01em | ink |
| Cook step text | sans | 25 / 36 | 400 | −0.01em | ink |
| Feature title (Tonight) | sans | 24 / 30 | 500 | −0.01em | ink |
| Day name (plan) | sans | 20 / 26 | 500 | – | ink (accent when today) |
| Item name | sans | 17 / 22 | 500 | – | ink |
| Lede / standfirst | sans | 17 / 27 | 400 | – | ink2 |
| Method step | sans | 17 / 27 | 400 | – | ink2 |
| Meal title (plan) | sans | 16 / 22 | 400 | – | ink |
| Plan subtitle | sans | 16 / 24 | 400 | – | ink2 |
| Recipe list title (cookbook) | sans | 18 | 500 | – | ink |
| Secondary line | sans | 14 / 20 | 400 | – | ink3 |
| Index subline (Home) | sans | 15 / 22 | 400 | – | ink3 |
| Quantity | mono | 14 / 22 | 400 | – | ink2 |
| Section heading ("Ingredients", "Tonight") | mono caps | 13 / 16 | 500 | 0.02em | ink |
| Button label | mono caps | 13 / 16 | 500 | 0.04em | onAccent |
| Day kcal total | mono | 13 / 16 | 500 | 0.02em | ink (ink3 when incomplete) |
| Meal kcal | mono | 13 / 16 | 400 | – | ink2 |
| Label / meta | mono caps | 12 / 16 | 400 | 0.02em | ink3 |
| Group label (aisle, ingredient section) | mono caps | 12 / 16 | 400 | 0.02em | accent |
| Step number | mono | 12 / 27 | 400 | – | accent, zero-padded ("01") |
| Tag ("Optional", "· Today") | mono caps | 11 / 14 | 400 | 0.04em | ink3 (Today: accent) |

## Layout constants

- Screen width in the designs is 390. The side gutter is **24**, which leaves 342 for content.
- The top bar is a row with `space-between`, padding 10 top, 14 bottom and 24 at the sides,
  and holds 12px mono caps on each side. The back link is ink2; the right-hand meta is ink3.
- Page head padding is 24 at the top and 26–32 at the bottom. Title and lede are 12 apart
  (8 on the plan).
- The **quantity / label lane** is 92 wide, `flexShrink: 0`, and starts every list row:
  - ingredient quantities on the recipe, cook mode and shopping screens;
  - meal types on the plan.
- The kcal lane on the plan is 64 wide and right-aligned.
- The checkbox slot on the shopping list is 32 wide and right-aligned.
- The number lane is 36 wide: step numbers on the recipe, index numbers on Home.
- The trailing arrow slot is 20 wide and right-aligned.
- List rows are separated by a top hairline; the last row in a list also gets a bottom
  hairline.

## Components

**Brand mark.** A 12×12 accent square, then a gap of 10, then a 12 mono caps label. It
appears only in cook mode, as "■ Cook". No screen shows the word "Feedr".

**Back link.** "← Home" in 12 mono caps ink2, with padding 6 top and 4 bottom so the tap
target is larger.

**Primary button.** `accentFill` fill, height 52 (56 in the cook-mode footer), padding 20 at the
sides, and a row with `space-between`.
- Left: the label in 13 mono caps, weight 500, 0.04em tracking, colour `onAccent`.
- Right: "→" in 18 mono, colour `onAccent`.

**Secondary square button** (cook mode back). 56×56, 1px `line` border, "←" in 18 mono
ink2, centred.

**Text action** ("Clear ticks"). 12 mono caps ink2 with a dotted underline (offset 4).

**Chip** (recipe tags). A 1px `line` border, padding 2 vertical and 8 horizontal, holding
12 mono ink3. Chips in a row are 6 apart.

**Timer chip.** The same as a chip, but with padding 3 vertical, ink2 text and caps:
"◷ Timer · 12 min".

**Section header row.** A row with baseline alignment and `space-between`: a mono
13/500 ink heading on the left, a 12 mono caps ink3 count on the right. For example,
"Ingredients" with "11 items · for 2".

**Group label.** 12 mono caps accent, with padding 22 top (26 when it follows a list) and
10 bottom. Every group after the first has a top hairline.

**Ingredient row.** Used on the recipe, cook mode and shopping screens.
- A row with top alignment, padding 11 top and bottom, and a top hairline.
- `[92 quantity]`, then a flexible column of the name (17/500 ink) and an optional
  prep line (14 ink3, 1 below).
- An optional tag sits inline after the name, 8 apart.

**Highlighted ingredient row** (cook mode, the active term).
- An absolute background extends 12 past each side, filled with accent at 9% and with a
  2px accent left border.
- The quantity becomes ink 500 and the name becomes accent.
- The prep line adds "· 4 of 6, 2 for step 05" in ink2.

**Shopping item.** An ingredient row with the recipe names as the second line, joined by
" · ", and the checkbox slot at the end.
- Unticked: a 20×20 box with a 1px ink3 outline.
- Ticked:
  - the box is filled with `accentFill` and holds a 13/600 "✓" in `onAccent`;
  - the quantity and name become ink3 with a line-through;
  - the recipe line stays as it is.
- Ticked items stay where they are, so the list doesn't jump while you shop.

**Meal row** (plan).
- A row with baseline alignment, padding 9 top and bottom, and hairlines between rows
  (none above the first).
- `[92 meal type, mono caps ink3]`, then the title (16 ink, flexible), then
  `[64 kcal, mono 13 ink2, right-aligned]`.
- An optional second line goes under the title in 14 ink3, 2 below it. For example,
  "Leftovers from Monday".
- An empty slot reads "+ Add dinner" in 16 ink3 with a dotted underline, and its kcal is
  "—" in ink3.

**Day section** (plan).
- A full-bleed top hairline, padding 18 top, 14 bottom and 24 at the sides.
- The header row has baseline alignment and `space-between`, with 8 below it.
  - On the left: the day name (20/500) and, 8 after it, the date (16 ink3).
  - On the right: the day total (13 mono/500 ink). If the day isn't fully planned, it
    reads "850 kcal so far" in ink3.
- Today:
  - the top border becomes 2px accent;
  - the day name becomes accent;
  - "· Today" is added as an 11 mono caps accent tag.

**Index row** (Home).
- A row with top alignment, padding 16 top and bottom, and a top hairline (the last row
  also has a bottom one).
- `[36 number: 12 mono accent, line height 32]`, then a flexible column of the title
  (26/32/500) and the subline (15/22 ink3, 2 below), then `[20 "→": 18 mono ink3,
  line height 32]`.

**Filter tabs** (cookbook).
- A row of 12 mono caps labels with counts, such as "Dinner 12".
- Inactive tabs are ink3. The active tab is ink with weight 500 and a 2px accent bottom
  border.
- A hairline runs under the whole row.

**Cookbook row.**
- The title (18/500 ink), with a meta line under it: 12 mono caps ink3, such as
  "1 hr · Serves 2 · 640 kcal".
- A trailing "→" in the 20 slot.
- Hairlines between rows.

**Agent note** (recipe).
- A 1px accent left border with 16 padding on the left and 2 at the top and bottom.
- The label is 12 mono caps accent ("Agent note · For 2"). The body is 15/23 ink2, 6
  below it.

**Meta row** (recipe). Four equal columns 16 apart. Each has a 12 mono caps ink3 label
with a 16/22 ink value 6 below it.

**Progress bar** (cook mode). Six segments 4 apart, each 3 tall. Completed steps are accent;
the rest are `line`.

**Ingredient term in step text.**
- Recipe page: the term is weight 500 with a dotted underline (offset 4).
- Cook mode: the term has a dotted underline (offset 5) followed by a 17 mono accent "+".
- Cook mode, active term: the term turns accent with a solid underline, and the "+"
  becomes "−".
- Durations in cook-mode step text are weight 600.

## Screen notes

**Home.** In order:
1. The top bar holds only the date ("Tue 18 Nov") on the left, in 12 mono caps ink3.
   There is no brand mark, greeting or page title.
2. Tonight, which starts straight under the top bar and has 36 padding below it:
   - a section header ("Tonight" on the left, "Dinner · 520 kcal" on the right);
   - the feature title;
   - a meta line ("35 min · Serves 2");
   - a gap of 20, then the primary button "Start cooking · N steps".
3. The index, rows 01–04: Meal plan, Cookbook, Shopping list, People. Each subline is
   live data: unplanned meals, recipe count, items and ticked count, people's names.

If nothing is planned for tonight, hide the Tonight block rather than showing it empty.

**Meal plan.**
- The top bar has "← Home" on the left. On the right is the week switcher:
  "← 17–23 Nov →", with ink3 arrows in 14 mono and the range in 12 mono caps ink2.
- The head is "This week" with "N meals left to plan · X kcal a day".
- Below that come the day sections.
- The kcal shown are one person's portions. When an account has several people, see
  "People on the plan" in BUILD.md.

**Cookbook.** The title is "Cookbook" with "N recipes, kept up to date by your agent."
Below it are the filter tabs (All, Breakfast, Lunch, Dinner, with counts) and the
cookbook rows. A row opens the recipe.

**Recipe.**
- The top bar has only "← Recipes" on the left.
- The hero has, in order: chips, the title, a standfirst, the meta row, an agent note,
  and the primary button.
- Then come Ingredients (grouped by section) and Method (numbered steps with timer
  chips), followed by "Per serving" nutrition with "[agent estimate]" in italic ink3 mono
  and the source footer.
- There is no image and no edit UI: agents create and edit recipes.

**Cook mode.**
- The top bar is the accent square with "Cook" on the left and "Close ✕" on the
  right, with the progress bar under it.
- Next is a "Step 03 / 06" chip, with the recipe name on the right.
- The step text is followed by "For this step", listing that step's ingredients.
- Tapping a term in the step highlights its row.
- The footer has the square back button and "Next · Step 04 →".

**Shopping list.**
- The top bar is "← Home" on the left and the week range on the right.
- The head is "Shopping list" with "This week's plan, grouped by aisle."
- A summary row reads "14 items · 4 ticked" with "Clear ticks" on the right.
- Items are grouped by aisle.
- Multiple amounts are joined with " + " in the quantity lane, which wraps if needed.
- Ticks stay local, as they do today (AsyncStorage per week).

## Data gaps

- BUILD.md's "Data changes" section fills these gaps: step-ingredient links with per-step
  amounts, minutes on recipe summaries, and meal types from tags. Portion kcal comes from
  `/plan`.
