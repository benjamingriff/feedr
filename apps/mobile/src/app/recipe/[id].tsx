import { useState } from "react";
import { Linking } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { Recipe } from "@feedr/core";
import { useApiQuery } from "../../store";
import { Ingredients, NutritionTable } from "../../recipe-content";
import {
  Button,
  Card,
  ErrorMessage,
  QueryState,
  Row,
  Screen,
  T,
} from "../../ui";
export default function RecipeScreen() {
  const { id, versionId } = useLocalSearchParams<{
    id: string;
    versionId?: string;
  }>();
  const [selected, setSelected] = useState(versionId);
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
          <T title>{recipe.title}</T>
          {!!recipe.description && <T>{recipe.description}</T>}
          {!!recipe.source_url && (
            <Button
              title={`Source: ${recipe.source_name ?? recipe.source_url}`}
              secondary
              onPress={() => {
                void Linking.openURL(recipe.source_url!).catch(() =>
                  setLinkError("Could not open source link."),
                );
              }}
            />
          )}
          <ErrorMessage error={linkError} />
          <Row>
            {recipe.versions.map((v) => (
              <Button
                key={v.id}
                title={`${v.label} · ${v.servings} servings`}
                secondary={version?.id !== v.id}
                onPress={() => setSelected(v.id)}
              />
            ))}
          </Row>
          {version ? (
            <>
              <Card>
                <T title>{version.label}</T>
                <T>
                  {version.servings} servings · Prep{" "}
                  {version.prep_minutes ?? "—"} min · Cook{" "}
                  {version.cook_minutes ?? "—"} min
                </T>
                {!!version.notes && <T>{version.notes}</T>}
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
