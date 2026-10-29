import type { IngredientLine, Nutrition, NutrientKey } from "@feedr/core";
import { Card, Row, T, num } from "./ui";
const nutrients: [NutrientKey, string][] = [
  ["kcal", "Energy (kcal)"],
  ["protein_g", "Protein (g)"],
  ["carbs_g", "Carbs (g)"],
  ["fat_g", "Fat (g)"],
  ["saturated_fat_g", "Saturates (g)"],
  ["fibre_g", "Fibre (g)"],
  ["sugar_g", "Sugar (g)"],
  ["salt_g", "Salt (g)"],
];
export function Ingredients({ lines }: { lines: IngredientLine[] }) {
  const groups = new Map<string, IngredientLine[]>();
  for (const line of lines) {
    const section = line.section ?? "Ingredients";
    groups.set(section, [...(groups.get(section) ?? []), line]);
  }
  return (
    <>
      {[...groups].map(([section, ingredients]) => (
        <Card key={section}>
          <T title>{section}</T>
          {ingredients.map((line) => (
            <T key={line.id}>
              {line.raw_text ||
                `${num(line.quantity)} ${line.unit ?? ""} ${line.ingredient}`}
              {line.optional ? " (optional)" : ""}
            </T>
          ))}
        </Card>
      ))}
      {!lines.length && <T muted>No ingredients listed.</T>}
    </>
  );
}
export function NutritionTable({
  nutrition,
  servings,
}: {
  nutrition: Nutrition | null;
  servings: number;
}) {
  if (!nutrition) return <T muted>No nutrition available.</T>;
  return (
    <Card>
      <T title>Nutrition</T>
      <Row>
        <T>Per serving / whole batch</T>
      </Row>
      {nutrients.map(([key, label]) => (
        <T key={key}>
          {label}:{" "}
          {num(nutrition[key] == null ? null : nutrition[key] / servings)} /{" "}
          {num(nutrition[key])}
        </T>
      ))}
      <T muted>
        Source:{" "}
        {nutrition.source === "from_source" ? "from source" : "agent estimate"}
      </T>
      {!!nutrition.notes && <T muted>{nutrition.notes}</T>}
    </Card>
  );
}
