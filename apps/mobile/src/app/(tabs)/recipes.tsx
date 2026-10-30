import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import type { RecipeSummary } from "@feedr/core";
import { useApiQuery } from "../../store";
import { Chevron, Field, QueryState, Screen, T, num, s } from "../../ui";
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
      <View style={s.group}>
        {query.data?.map((recipe) => {
          const original =
            recipe.versions.find((v) => v.is_original) ?? recipe.versions[0];
          return (
            <Pressable
              key={recipe.id}
              accessibilityRole="button"
              accessibilityLabel={recipe.title}
              onPress={() => router.push(`/recipe/${recipe.id}`)}
              style={s.listRow}
            >
              {!!recipe.image_url && (
                <Image
                  source={{ uri: recipe.image_url }}
                  contentFit="cover"
                  style={{ width: 56, height: 56, borderRadius: 6 }}
                />
              )}
              <View style={{ flex: 1, gap: 3 }}>
                <T style={{ fontWeight: "600" }}>{recipe.title}</T>
                {!!recipe.tags.length && (
                  <T small muted numberOfLines={1}>
                    {recipe.tags.join(" · ")}
                  </T>
                )}
                <T small muted>
                  {recipe.versions.length}{" "}
                  {recipe.versions.length === 1 ? "version" : "versions"} ·{" "}
                  {num(
                    original?.kcal == null
                      ? null
                      : original.kcal / original.servings,
                  )}{" "}
                  kcal/serving
                </T>
              </View>
              <Chevron />
            </Pressable>
          );
        })}
      </View>
      {query.data?.length === 0 && <T muted>No recipes found.</T>}
    </Screen>
  );
}
