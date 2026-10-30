import type { IngredientLine, Nutrition, NutrientKey } from "@feedr/core";
import { View } from "react-native";
import { Card, T, Tag, num, s } from "./ui";
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
          <T style={{ fontWeight: "600" }}>{section}</T>
          {ingredients.map((line) => (
            <View key={line.id} style={{ gap: 2 }}>
              <T>
                {line.raw_text ||
                  `${num(line.quantity, 6)} ${line.unit ?? ""} ${line.ingredient}`}
              </T>
              {line.optional && <Tag>Optional</Tag>}
            </View>
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
      <View style={s.spread}>
        <T style={{ fontWeight: "600" }}>Nutrition</T>
        <Tag>
          {nutrition.source === "from_source" ? "From source" : "Estimated"}
        </Tag>
      </View>
      <View style={s.spread}>
        <T small muted style={{ flex: 1.3 }}>
          Nutrient
        </T>
        <T small muted style={{ flex: 1, textAlign: "right" }}>
          Per serving
        </T>
        <T small muted style={{ flex: 0.8, textAlign: "right" }}>
          Batch
        </T>
      </View>
      {nutrients.map(([key, label]) => (
        <View
          key={key}
          style={[
            s.spread,
            { borderTopWidth: 0.5, borderColor: "#d9dfdb", paddingTop: 5 },
          ]}
        >
          <T small style={{ flex: 1.3 }}>
            {label}
          </T>
          <T small style={{ flex: 1, textAlign: "right" }}>
            {num(
              nutrition[key] == null ? null : nutrition[key] / servings,
              key === "salt_g" ? 1 : 0,
            )}
          </T>
          <T small style={{ flex: 0.8, textAlign: "right" }}>
            {num(nutrition[key], key === "salt_g" ? 1 : 0)}
          </T>
        </View>
      ))}
      {!!nutrition.notes && (
        <T small muted>
          {nutrition.notes}
        </T>
      )}
    </Card>
  );
}
