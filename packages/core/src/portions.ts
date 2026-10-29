import type { Slot, SlotSplit } from './schemas.ts';

export interface PersonTargets {
  daily_kcal: number;
  daily_protein_g: number | null;
  slot_split: SlotSplit;
}

/** A person's calorie and protein targets for one meal slot. */
export function slotTarget(person: PersonTargets, slot: Slot): { kcal: number; protein_g: number | null } {
  const fraction = person.slot_split[slot];
  return {
    kcal: Math.round(person.daily_kcal * fraction),
    protein_g: person.daily_protein_g == null ? null : Math.round(person.daily_protein_g * fraction),
  };
}

/** Each portion's fraction of the cooked dish, proportional to its calorie target. */
export function sharesFromTargets(targets: number[]): number[] {
  const total = targets.reduce((sum, t) => sum + t, 0);
  if (total <= 0) return targets.map(() => (targets.length ? 1 / targets.length : 0));
  return targets.map((t) => t / total);
}
