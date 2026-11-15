import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DishUpMeal, Service } from "@feedr/core";
import { dayName, shortDate, today } from "../../dates";
import { capitalise, num, pct } from "../../format";
import {
  BackLink,
  ErrorLine,
  Field,
  Fill,
  GroupLabel,
  Gutter,
  Lane,
  PageHead,
  PrimaryButton,
  QueryState,
  Row,
  Screen,
  SectionHeader,
  Text,
  TextAction,
  TopBar,
  confirmAction,
} from "../../primitives";
import { useApiQuery, useStore } from "../../store";
import { mono } from "../../theme";

/** "Tonight · Dinner", "Wed · Lunch", or "Leftovers" for portions with no meal yet. */
function mealLabel(meal: DishUpMeal) {
  if (!meal.date || !meal.slot) return "Leftovers";
  const when = meal.date !== today() ? dayName(meal.date).slice(0, 3) : meal.slot === "dinner" ? "Tonight" : "Today";
  return `${when} · ${capitalise(meal.slot)}`;
}

/** Dish-up: enter what the cooked dish weighs and read off the grams for each plate. */
export default function DishUp() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useStore();
  const client = useQueryClient();
  const query = useApiQuery<Service>(["service", id], `/services/${id}`);
  const service = query.data;
  const [draft, setDraft] = useState<string | null>(null);
  const weight = draft ?? service?.cooked_weight_g?.toString() ?? "";

  const save = useMutation({
    mutationFn: () => {
      const grams = weight.trim() ? Number(weight) : null;
      if (grams !== null && !(grams > 0)) throw new Error("Enter the weight in grams, or leave it blank to clear it.");
      return api<Service>(`/services/${id}`, { cooked_weight_g: grams }, "PATCH");
    },
    onSuccess: () => {
      setDraft(null);
      void client.invalidateQueries();
    },
  });
  const remove = useMutation({
    mutationFn: (portionId: string) => api<{ service: Service | null }>(`/portions/${portionId}`, undefined, "DELETE"),
    onSuccess: ({ service: left }) => {
      if (left) return void client.invalidateQueries();
      // Removing the last portion removes the service: leave, and don't refetch what's gone.
      if (router.canGoBack()) router.back();
      else router.replace("/plan");
      void client.invalidateQueries({ predicate: (q) => !q.queryKey.includes(id) });
    },
  });

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <TopBar left={<BackLink label="Back" fallback="/plan" />} />
      <QueryState query={query} />
      {service && (
        <>
          <PageHead title={service.recipe_title} lede={`Cooked ${shortDate(service.cook_date)} · ${service.version_label}`} />
          <Gutter>
            <SectionHeader title="Cooked weight" />
            <Field
              label="The whole dish"
              suffix="g"
              value={weight}
              onChangeText={setDraft}
              keyboardType="decimal-pad"
              placeholder="0"
              style={{ marginBottom: 20 }}
            />
            <PrimaryButton label={save.isPending ? "Saving…" : "Save weight"} disabled={save.isPending} onPress={() => save.mutate()} />
            <ErrorLine error={save.error ?? remove.error} />
            <View style={{ height: 14 }} />
            {service.dish_up.meals.map((meal, m) => (
              <View key={`${meal.date}-${meal.slot}`}>
                <GroupLabel label={mealLabel(meal)} first={m === 0} />
                <Text variant="label" style={{ paddingBottom: 12 }}>
                  {[
                    `${pct(meal.share)} of the dish`,
                    meal.grams != null && `${num(meal.grams)} g`,
                    meal.fraction,
                    meal.ratio && `Split ${meal.ratio}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                {meal.portions.map((p, i) => {
                  const portion = service.portions.find((x) => x.id === p.portion_id);
                  const name = p.person_name ?? "Unassigned";
                  return (
                    <Row key={p.portion_id} last={m === service.dish_up.meals.length - 1 && i === meal.portions.length - 1}>
                      <Lane size="label">
                        <Text variant="itemName" style={{ fontFamily: mono[500] }}>
                          {p.grams == null ? pct(p.share_of_meal) : `${num(p.grams)} g`}
                        </Text>
                      </Lane>
                      <Fill style={{ gap: 1 }}>
                        <Text variant="itemName">{name}</Text>
                        <Text variant="secondary">
                          {[
                            `${pct(p.share_of_meal)} of this meal`,
                            portion && `${num(portion.nutrition.kcal)} kcal`,
                            portion && `${num(portion.nutrition.protein_g)} g protein`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                        <TextAction
                          label="Remove"
                          disabled={remove.isPending}
                          style={{ marginTop: 8 }}
                          onPress={() =>
                            confirmAction(
                              `Remove ${name}'s portion?`,
                              "The others' shares grow to match. Removing the last portion removes this meal from the plan.",
                              "Remove",
                              () => remove.mutate(p.portion_id),
                            )
                          }
                        />
                      </Fill>
                    </Row>
                  );
                })}
              </View>
            ))}
          </Gutter>
        </>
      )}
    </Screen>
  );
}
