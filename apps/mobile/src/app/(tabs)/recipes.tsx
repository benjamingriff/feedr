import { useEffect, useState } from "react";
import { router } from "expo-router";
import type { RecipeSummary } from "@feedr/core";
import { useApiQuery } from "../../store";
import { Button, Card, Field, QueryState, Screen, T, num } from "../../ui";
export default function RecipesScreen() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQ(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useApiQuery<RecipeSummary[]>(
    ["recipes", q],
    `/recipes?q=${encodeURIComponent(q)}`,
  );
  return (
    <Screen
      refresh={() => void query.refetch()}
      refreshing={query.isRefetching}
    >
      <Field
        label="Search recipes"
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
      />
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data?.map((recipe) => {
        const original = recipe.versions.find((v) => v.is_original);
        return (
          <Card key={recipe.id}>
            <T title>{recipe.title}</T>
            <T muted>{recipe.tags.join(" · ")}</T>
            <T>
              {recipe.versions.length}{" "}
              {recipe.versions.length === 1 ? "version" : "versions"} ·{" "}
              {num(
                original?.kcal == null
                  ? null
                  : original.kcal / original.servings,
              )}{" "}
              kcal per original serving
            </T>
            <Button
              title="View recipe"
              secondary
              onPress={() => router.push(`/recipe/${recipe.id}`)}
            />
          </Card>
        );
      })}
      {query.data?.length === 0 && <T muted>No recipes found.</T>}
    </Screen>
  );
}
