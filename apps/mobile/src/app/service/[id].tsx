import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Service } from "@feedr/core";
import { useApiQuery, useStore } from "../../store";
import { dateLabel } from "../../dates";
import {
  Button,
  Card,
  ErrorMessage,
  Field,
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
          <T title>{service.recipe_title}</T>
          <T>
            {service.version_label} · Cooked{" "}
            {dateLabel(service.cook_date, true)}
          </T>
          <Card>
            <Field
              label="Cooked weight (g)"
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder="Weigh the whole cooked dish"
            />
            <Button
              title={save.isPending ? "Saving…" : "Save weight"}
              disabled={save.isPending}
              onPress={() => save.mutate()}
            />
            <ErrorMessage error={save.error} />
          </Card>
          <T title>Dish-up guide</T>
          {service.cooked_weight_g == null && (
            <T muted>
              Weigh the cooked food and save its weight to see grams for each
              plate.
            </T>
          )}
          {service.dish_up.meals.map((meal, i) => (
            <Card key={`${meal.date}-${meal.slot}-${i}`}>
              <T title>
                {meal.date ? dateLabel(meal.date, true) : "Unassigned"}{" "}
                {meal.slot ?? "leftovers"}
              </T>
              <T>
                {pct(meal.share)} of the pot
                {meal.fraction ? ` · ${meal.fraction}` : ""}
                {meal.grams == null ? "" : ` · ${num(meal.grams)} g`}
                {meal.is_rest ? " · the rest of the pot" : ""}
              </T>
              {!!meal.ratio && <T>Between people: {meal.ratio}</T>}
              {meal.portions.map((p) => {
                const portion = service.portions.find(
                  (portion) => portion.id === p.portion_id,
                );
                return (
                  <Card key={p.portion_id}>
                    <T>
                      {p.person_name ?? "Unassigned"} · {pct(p.share_of_meal)}{" "}
                      of this meal
                      {p.grams == null ? "" : ` · ${num(p.grams)} g`}
                      {p.is_rest ? " · the rest" : ""}
                    </T>
                    {portion && (
                      <T muted>
                        {num(portion.nutrition.kcal)} kcal ·{" "}
                        {num(portion.nutrition.protein_g)} g protein
                      </T>
                    )}
                    <Button
                      title="Remove"
                      secondary
                      disabled={remove.isPending}
                      onPress={() =>
                        confirmRemoval(() => remove.mutate(p.portion_id))
                      }
                    />
                  </Card>
                );
              })}
            </Card>
          ))}
          <ErrorMessage error={remove.error} />
          <Row>
            <Button
              title="View recipe"
              secondary
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
            <Button
              title="Start cook mode"
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
        </>
      )}
    </Screen>
  );
}
