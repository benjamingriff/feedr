import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Service } from "@feedr/core";
import { useApiQuery, useStore } from "../../store";
import { dateLabel } from "../../dates";
import {
  Button,
  Card,
  ErrorMessage,
  TextButton,
  Tag,
  s,
  QueryState,
  Row,
  Screen,
  T,
  confirmRemoval,
  num,
  pct,
} from "../../ui";
export default function ServiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useStore();
  const client = useQueryClient();
  const query = useApiQuery<Service>(["service", id], `/services/${id}`);
  const service = query.data;
  const [draftWeight, setWeight] = useState<string | null>(null);
  const weight = draftWeight ?? service?.cooked_weight_g?.toString() ?? "";
  const save = useMutation({
    mutationFn: () => {
      const value = weight.trim() ? Number(weight) : null;
      if (value !== null && (!Number.isFinite(value) || value <= 0))
        throw new Error(
          "Enter a cooked weight greater than zero, or leave blank to clear.",
        );
      return api<Service>(
        `/services/${id}`,
        { cooked_weight_g: value },
        "PATCH",
      );
    },
    onSuccess: () => {
      setWeight(null);
      void client.invalidateQueries();
    },
  });
  const remove = useMutation({
    mutationFn: (portionId: string) =>
      api<{ service: Service | null }>(
        `/portions/${portionId}`,
        undefined,
        "DELETE",
      ),
    onSuccess: (result) => {
      if (!result.service) {
        router.replace("/");
        // Do not refetch the service that the API has just deleted.
        void client.invalidateQueries({
          predicate: (query) => !query.queryKey.includes(id),
        });
        return;
      }
      void client.invalidateQueries();
    },
  });
  return (
    <Screen
      refresh={() => void query.refetch()}
      refreshing={query.isRefetching}
    >
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {service && (
        <>
          <View style={{ gap: 4 }}>
            <T title>{service.recipe_title}</T>
            <T muted>{service.version_label}</T>
            <T small muted>
              Cooked {dateLabel(service.cook_date, true)}
            </T>
            <Row>
              <TextButton
                title="Recipe"
                onPress={() =>
                  router.push({
                    pathname: "/recipe/[id]",
                    params: {
                      id: service.recipe_id,
                      versionId: service.version_id,
                    },
                  })
                }
              />
              <TextButton
                title="Cook"
                onPress={() =>
                  router.push({
                    pathname: "/cook/[versionId]",
                    params: {
                      versionId: service.version_id,
                      recipeId: service.recipe_id,
                    },
                  })
                }
              />
            </Row>
          </View>
          <Card>
            <T small muted>
              Cooked weight
            </T>
            <View style={s.spread}>
              <TextInput
                accessibilityLabel="Cooked weight (g)"
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholder="Weight in grams"
                style={[s.input, { flex: 1 }]}
              />
              <Button
                title={save.isPending ? "Saving…" : "Save"}
                disabled={save.isPending}
                onPress={() => save.mutate()}
              />
            </View>
            {service.cooked_weight_g == null && (
              <T small muted>
                Weigh the whole cooked dish to see grams per plate.
              </T>
            )}
            <ErrorMessage error={save.error} />
          </Card>
          {service.dish_up.meals.map((meal, i) => (
            <Card key={`${meal.date}-${meal.slot}-${i}`}>
              <View style={s.spread}>
                <T style={{ fontWeight: "600", flexShrink: 1 }}>
                  {meal.date ? dateLabel(meal.date) : "Unassigned"}{" "}
                  {meal.slot ?? "leftovers"}
                </T>
                <T small muted style={{ flexShrink: 1, textAlign: "right" }}>
                  {pct(meal.share)}
                  {meal.fraction ? ` · ${meal.fraction}` : ""}
                </T>
              </View>
              {meal.grams != null && (
                <Text style={s.large}>{num(meal.grams)} g</Text>
              )}
              {!!meal.ratio && (
                <T small muted>
                  Split {meal.ratio} between{" "}
                  {meal.portions
                    .map((p) => p.person_name ?? "Unassigned")
                    .join(" and ")}
                </T>
              )}
              {meal.portions.map((p) => {
                const portion = service.portions.find(
                  (portion) => portion.id === p.portion_id,
                );
                return (
                  <View
                    key={p.portion_id}
                    style={{
                      borderTopWidth: 0.5,
                      borderColor: "#d9dfdb",
                      paddingTop: 10,
                      gap: 4,
                    }}
                  >
                    <View style={s.spread}>
                      <Row>
                        <T style={{ fontWeight: "600" }}>
                          {p.person_name ?? "Unassigned"}
                        </T>
                        {p.is_rest && <Tag>the rest</Tag>}
                      </Row>
                      <Text style={s.large}>
                        {p.grams == null
                          ? pct(p.share_of_meal)
                          : `${num(p.grams)} g`}
                      </Text>
                    </View>
                    <T small muted>
                      {pct(p.share_of_meal)} of this meal
                      {portion
                        ? ` · ${num(portion.nutrition.kcal)} kcal · ${num(portion.nutrition.protein_g)} g protein`
                        : ""}
                    </T>
                    <View style={{ alignItems: "flex-end" }}>
                      <TextButton
                        title="Remove"
                        destructive
                        disabled={remove.isPending}
                        onPress={() =>
                          confirmRemoval(() => remove.mutate(p.portion_id))
                        }
                      />
                    </View>
                  </View>
                );
              })}
            </Card>
          ))}
          <ErrorMessage error={remove.error} />
        </>
      )}
    </Screen>
  );
}
