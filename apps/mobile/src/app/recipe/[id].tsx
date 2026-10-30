import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import type { Recipe } from "@feedr/core";
import { useApiQuery } from "../../store";
import { Ingredients, NutritionTable } from "../../recipe-content";
import {
  Button,
  Card,
  ErrorMessage,
  QueryState,
  TextButton,
  colors,
  Screen,
  T,
} from "../../ui";
export default function RecipeScreen() {
  const { id, versionId } = useLocalSearchParams<{
    id: string;
    versionId?: string;
  }>();
  const [selected, setSelected] = useState(versionId);
  const [more, setMore] = useState(false);
  const [linkError, setLinkError] = useState("");
  const query = useApiQuery<Recipe>(["recipe", id], `/recipes/${id}`);
  const recipe = query.data;
  const version =
    recipe?.versions.find((v) => v.id === selected) ?? recipe?.versions[0];
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
      {recipe && (
        <>
          {!!recipe.image_url && (
            <Image
              source={{ uri: recipe.image_url }}
              contentFit="cover"
              style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 10 }}
              accessibilityLabel={recipe.title}
            />
          )}
          <T title>{recipe.title}</T>
          {!!recipe.description && <T>{recipe.description}</T>}
          {!!recipe.source_url && (
            <TextButton
              title={`${recipe.source_name ?? new URL(recipe.source_url).hostname} ↗`}
              onPress={() => {
                void Linking.openURL(recipe.source_url!).catch(() =>
                  setLinkError("Could not open source link."),
                );
              }}
            />
          )}
          <ErrorMessage error={linkError} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: 6 }}
          >
            {recipe.versions.map((v) => (
              <Pressable
                key={v.id}
                accessibilityRole="button"
                accessibilityLabel={`${v.label} · ${v.servings} servings`}
                accessibilityState={{ selected: version?.id === v.id }}
                onPress={() => {
                  setSelected(v.id);
                  setMore(false);
                }}
                style={{
                  maxWidth: 280,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: 8,
                  backgroundColor:
                    version?.id === v.id ? colors.accent : "white",
                }}
              >
                <T
                  small
                  numberOfLines={1}
                  style={{
                    color: version?.id === v.id ? "white" : colors.text,
                  }}
                >
                  {v.label} · {v.servings} servings
                </T>
              </Pressable>
            ))}
          </ScrollView>
          {version ? (
            <>
              <Card>
                <T style={{ fontWeight: "600" }}>{version.label}</T>
                <T>
                  {version.servings} servings · Prep{" "}
                  {version.prep_minutes ?? "—"} min · Cook{" "}
                  {version.cook_minutes ?? "—"} min
                </T>
                {!!version.notes && (
                  <View>
                    <T numberOfLines={more ? undefined : 3}>{version.notes}</T>
                    <TextButton
                      title={more ? "Less" : "More"}
                      onPress={() => setMore(!more)}
                    />
                  </View>
                )}
                <Button
                  title="Cook"
                  onPress={() =>
                    router.push({
                      pathname: "/cook/[versionId]",
                      params: { versionId: version.id, recipeId: recipe.id },
                    })
                  }
                />
              </Card>
              <NutritionTable
                nutrition={version.nutrition}
                servings={version.servings}
              />
              <Ingredients lines={version.ingredients} />
              <Card>
                <T title>Steps</T>
                {version.steps.map((step, i) => (
                  <T key={step.id}>
                    {i + 1}. {step.section ? `${step.section}: ` : ""}
                    {step.text}
                  </T>
                ))}
                {!version.steps.length && <T muted>No steps listed.</T>}
              </Card>
            </>
          ) : (
            <T muted>No recipe versions.</T>
          )}
        </>
      )}
    </Screen>
  );
}
