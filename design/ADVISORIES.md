# Advisories from the first design exploration

In November 2026 an agent built a separate HTML prototype of the plan, recipe and cook
screens, and a four-model council reviewed it for five rounds. The visual direction was
rejected in favour of the Paper design in `README.md`, so none of its look carries over.
This file keeps the findings that still apply to the Paper design and the code on `main`.

Each item says what was found, what `main` does today, and what I'd suggest. The items
marked **Issue** are worth filing.

## Already right on main

These came up in review, and `main` already handles them. Keep them that way.

- **Step ingredient links.** Cook mode needs to know which lines each step uses. The
  `step_ingredients` table and the MCP `ingredients: [{ line, quantity?, unit? }]` field
  cover it.
- **Leftovers are their own portions.** The prototype counted a leftover lunch at the
  dinner portion's kcal, and two reviewers caught it. On `main` a leftover is a separate
  portion with its own target, and day totals add up the calculated nutrition of each
  assigned portion. Don't model leftovers as "the same meal shown twice". One gap remains:
  moving an unassigned leftover into a slot keeps its stored target unless the caller also
  sends a new `target_kcal`, so it isn't recalculated for that slot (`updatePortion` in
  `service.ts`).
- **Dish-up follows the planned version only.** If you cycle to another version on the
  recipe page, `main` hides "Dish up" and leaves `serviceId` out when it opens cook mode,
  so dish-up can't split a pot it didn't plan (`recipe/[id].tsx`).
- **Scaling isn't linear.** The prototype's "for 4" version doubled everything except the
  curry paste. The MCP instructions already tell agents not to scale spices or aromatics
  linearly and to record the change in `notes`.
- **Dish-up arithmetic, mostly.** Portions round to 5 g and the last one takes the rest
  (`dishup.ts`), which matches what the prototype did. There's an edge case, though. If
  rounding pushes the earlier portions up far enough, the remainder goes negative, gets
  clamped to 0, and the grams add up to more than the pot. With 1,000 g and targets of
  333, 333, 333 and 1, the plates get 335, 335, 335 and 0. That's rare with real targets,
  but worth a focused test.
- **Keep-awake in cook mode.**

## 1. Swapping a planned meal · Issue

The original brief called this the key feature: pick Wednesday dinner, see what the agent
proposed, and change it to another saved recipe. On `main` you can fill an empty slot from
the cookbook, but there's no direct way to replace a meal that's already planned. Tapping a
meal opens its recipe. The only path today is to remove that slot's portions in Dish-up
until the slot is empty, then add a new meal to it. Any leftovers you keep still belong to
the original dish, so Thursday lunch stays the old recipe. Nobody would find this path.

**API.** `ServiceUpdate` has no `version_id`, so a replace means deleting the service and
posting a new one. The client would have to rebuild every portion, including the leftover
lunch, which is easy to get wrong. I'd add `version_id` to `PATCH /services/:id` and to the
`update_service` MCP tool and keep the portions as they are. Leftovers then follow the swap
for free because they belong to the same service.

This is follow-up work. `BUILD.md` kept the first pass to a short list of backend changes,
and this isn't on it. The issue should cover two side effects:

- A saved cooked weight belongs to the old dish, so a version change should clear
  `cooked_weight_g`.
- The shopping list is worked out from the planned services, so it follows the swap on its
  own. That's the right behaviour, but say so in the UI if the list may already have been
  used.

**App.** The plan to cookbook pick mode path already exists. Pick mode could take a
`serviceId` and patch that service instead of posting a new one. A "Swap" text action on
the recipe page, shown when it's opened from the plan, fits the Paper components.

**Say what else changes.** In review, the most praised part of the swap flow was saying the
consequence before you commit. When the service has portions on other days, show one line
in pick mode such as "Also changes Thursday lunch, the leftovers from this dinner."

## 2. What a swap really changes

The prototype treated a swap as "this recipe has more kcal than that one". In feedr's
model, each portion gets the version's batch nutrition multiplied by its target share
(`getService` in `service.ts`). So a person's kcal and protein depend on how the batch
compares with the sum of the portion targets, not on the recipe alone. For example, if the
new version's batch kcal is half the sum of the targets, every portion gets about half its
kcal target. Protein follows the same share of the batch's protein, so it can land anywhere
against each person's protein target.

So the consequences worth showing in pick mode when replacing are:

- the other meals the service feeds (item 1);
- each portion's kcal against its target when the batch doesn't fit, for example
  "Ben 380 of 760 kcal";
- protein against target, when the person has one. `daily_protein_g` is optional.

This needs no new endpoint, but it needs more reads than pick mode does now. Cookbook
summaries carry batch kcal only, so protein needs the full recipe (`/recipes/:id`), and the
portion targets come from `/services/:id`. The maths is `sharesFromTargets` from core.

## 3. Repeats in pick mode

When you pick a recipe that's already planned elsewhere that week, say so on the row, for
example "Also Thursday dinner". Make it information, not a disabled row. The council pushed
back on disabling repeats, because eating the same breakfast all week is normal.

A related case is replacing one of five identical breakfasts. They can be five services or
portions of one batch, and a swap's reach follows `service_id`. If Wednesday's breakfast is
its own service, "just Wednesday" is the natural default. If it shares a service with other
days, swapping it changes them too, and pick mode should say so, as with leftovers. Leave an
"every day" option until someone asks for it.

## 4. Cook timers you can't see · Issue

On `main`, a timer only shows on its own step. Start the 12-minute rice on step 1, move on
to step 3, and nothing on screen tells you the rice is running or that it finished. Finish
and Close also drop running timers without a word.

Reviewers called persistent timers one of the best parts of cook mode, and the references
(HelloFresh, Julienne) do the same. Suggestion:

- Show every running or finished timer from other steps as timer chips on every step, just
  above the footer. The chip component and the `timers` state already exist.
- A finished chip stays accent and "Done" until tapped.
- A haptic on finish with `expo-haptics`, which works in Expo Go.
- If timers are running, Finish and Close ask before ending them.

## 5. Dish-up: say what to weigh

`main` takes one cooked weight per service, and the field is labelled "The whole dish".
Every review round still asked the same thing: what about sides cooked separately, like
rice? Someone who cooks rice in another pan will often weigh only the curry. The grams then
cover the curry alone, and the rice has no guide.

Two small changes, with no new data:

- One hint under the field for separately cooked sides, for example "Cooked the rice
  separately? Weigh it in too, or split it by the same percentages."
- Show each portion's share of the whole dish ("31% of the dish"). Meals show this already,
  but portions only show their share of the meal. The API returns `share` per portion.

Separate weights per component, such as curry and rice, would answer the question
completely. That's a schema change, so I'd hold it until the simple version proves too
vague.

## 6. Protein on the plan

`/plan` returns each person's protein totals and `target_protein_g`, but the plan screen
shows kcal only. Both numbers depend on the batch, but when an agent picks a version close to
the targets, as the MCP instructions ask, kcal tends to land near target. Protein varies
more from recipe to recipe, so it's the more useful number when choosing meals. It's a design call for the Paper file, not a defect.
Something like "Ben 2,410 kcal · 162 g" in the day line would fit the existing mono style.

## 7. Planned version versus the one on screen

When you open a recipe from the plan and cycle to another version, nothing says it isn't
the planned one, and "Dish up" quietly disappears. One `label` line under the version
action, such as "Planned: For 4", would explain both.

## 8. Hands-free cook mode, if it ever comes back

The prototype tried voice commands and tap-the-step-to-advance. Two lessons:

- Tapping anywhere on the step to advance is risky. A brushed screen skips a step, and
  there's no visible undo. The big Next button on `main` is the better choice.
- If voice is added, show "listening" only once recognition has actually started, and show
  a clear unavailable state otherwise. The first prototype showed an active mic in browsers
  that couldn't listen, and three reviewers caught it.

## 9. Later: the agent's proposal

The first brief imagined the agent proposing a week that you confirm, after which a
background agent does the shopping. None of that exists yet, and that's fine. Two notes for
when it does:

- The plan would need a draft or confirmed state per week. Today every service is final the
  moment it's written.
- The agent could give a one-line reason with each alternative it suggests, such as "Uses
  the chicken thighs already on the list". Reviewers rated these reasons highly. It would
  need somewhere to store them, which is a bigger API change, so it's an idea, not a plan.
- Copy must match what really happens. An early version said "shopping is ordered Sunday,
  6pm" before ordering existed, and reviewers flagged it.

## How the process went wrong

The council scored against well-known apps from Mobbin, which are mostly photo-led and
dense. Five rounds pushed the design towards those apps, and it reached 9/10 from every
reviewer while missing what Ben wanted. The council can't judge the owner's taste.

What the council was good at was catching logic in the prototype's code: Undo resetting
the whole week, totals not updating after a swap, the chosen version not reaching cook
mode, and leftovers counted at the wrong size. For future design work:

- Use the owner's Paper file as the reference standard, not other apps.
- Get a taste check from Ben after the first round, before iterating.
- Point reviewers at behaviour and data consistency, where they find real defects.

## Issue candidates

1. Swap a planned meal: `version_id` on `PATCH /services/:id` and `update_service`, plus
   pick mode replacing a service (items 1 to 3).
2. Cook timers visible across steps, with a haptic on finish and a check before closing
   (item 4).
3. Dish-up weighing hint and each portion's share of the whole dish (item 5).
4. Dish-up grams can exceed the cooked weight in a rounding edge case (see "Already right
   on main").
