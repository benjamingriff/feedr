import { useMemo } from 'react';
import type { Plan, Slot } from '@feedr/core';
import { addDays, dayName } from './dates';
import { num } from './format';
import { useApiQuery } from './store';

// Turns /plan (days → people → meals) into what the plan screen draws: days → slots → dishes,
// each dish listing who eats it.

export interface Eater {
  name: string;
  kcal: number | null;
}

export interface Dish {
  serviceId: string;
  recipeId: string;
  title: string;
  eaters: Eater[];
  /** The day this was first eaten, when it's a later meal from the same cook: "Monday". */
  leftoverFrom: string | null;
}

export interface SlotMeals {
  slot: Slot;
  /** Empty when nobody has a meal in this slot yet. */
  dishes: Dish[];
}

export interface DayMeals {
  date: string;
  slots: SlotMeals[];
  /** Each person's kcal for the day. */
  totals: Eater[];
  /** False while breakfast, lunch or dinner has nobody eating. */
  complete: boolean;
}

export interface Week {
  start: string;
  days: DayMeals[];
  people: { name: string; targetKcal: number }[];
  /** Breakfast, lunch and dinner slots across the week that nobody has a meal in. */
  mealsLeft: number;
}

const MAIN_SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner'];

/**
 * Builds the week starting at `start` from a plan that may begin earlier. Days before `start`
 * are only used to spot leftovers cooked the day before the week begins.
 */
export function buildWeek(plan: Plan, start: string): Week {
  const firstEaten = new Map<string, string>();
  for (const day of plan.days)
    for (const person of day.people)
      for (const meal of person.meals) if (!firstEaten.has(meal.service_id)) firstEaten.set(meal.service_id, day.date);

  const days = plan.days
    .filter((day) => day.date >= start)
    .map((day): DayMeals => {
      const slotsUsed = new Set(day.people.flatMap((p) => p.meals.map((m) => m.slot)));
      const slots = [...MAIN_SLOTS, ...(slotsUsed.has('snack') ? (['snack'] as const) : [])].map((slot): SlotMeals => {
        // One dish per service, so a meal shared by everyone is a single row.
        const dishes = new Map<string, Dish>();
        for (const person of day.people)
          for (const meal of person.meals) {
            if (meal.slot !== slot) continue;
            const first = firstEaten.get(meal.service_id)!;
            const dish = dishes.get(meal.service_id) ?? {
              serviceId: meal.service_id,
              recipeId: meal.recipe_id,
              title: meal.recipe_title,
              eaters: [],
              leftoverFrom: first < day.date ? dayName(first) : null,
            };
            dish.eaters.push({ name: person.name, kcal: meal.nutrition.kcal });
            dishes.set(meal.service_id, dish);
          }
        return { slot, dishes: [...dishes.values()] };
      });
      return {
        date: day.date,
        slots,
        totals: day.people.map((p) => ({ name: p.name, kcal: p.totals.kcal })),
        complete: slots.every((s) => s.dishes.length > 0),
      };
    });

  return {
    start,
    days,
    people: (plan.days[0]?.people ?? []).map((p) => ({ name: p.name, targetKcal: p.target_kcal })),
    mealsLeft: days.reduce((n, day) => n + day.slots.filter((s) => !s.dishes.length).length, 0),
  };
}

/** The week's plan, fetched with one extra day in front for leftovers. */
export function useWeek(start: string) {
  const query = useApiQuery<Plan>(['plan', start], `/plan?start=${addDays(start, -1)}&end=${addDays(start, 6)}`);
  const week = useMemo(() => (query.data ? buildWeek(query.data, start) : undefined), [query.data, start]);
  return { query, week };
}

/** Tonight's dinner: the dish most people are eating. */
export function tonight(week: Week, date: string): Dish | undefined {
  const dinner = week.days.find((d) => d.date === date)?.slots.find((s) => s.slot === 'dinner');
  return dinner?.dishes.reduce<Dish | undefined>(
    (best, d) => (best && best.eaters.length >= d.eaters.length ? best : d),
    undefined,
  );
}

/** "Ben 700 · Jess 520": who is eating and their kcal. */
export function eaterLine(eaters: Eater[]) {
  return eaters.map((e) => `${e.name} ${num(e.kcal)}`).join(' · ');
}
