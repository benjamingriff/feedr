import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import type { Recipe, RecipeVersion, Step } from "@feedr/core";
import { useApiQuery } from "../../store";
import { Ingredients } from "../../recipe-content";
import { Button, Card, QueryState, Row, Screen, T } from "../../ui";
function Timer({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  const [deadline, setDeadline] = useState<number | null>(null);
  useEffect(() => {
    if (deadline == null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (!left) setDeadline(null);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [deadline]);
  return (
    <Card>
      <T title>
        {remaining === 0
          ? "Timer finished"
          : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
      </T>
      <Row>
        <Button
          title={deadline ? "Pause timer" : "Start timer"}
          disabled={!remaining}
          onPress={() =>
            setDeadline(deadline ? null : Date.now() + remaining * 1000)
          }
        />
        <Button
          title="Reset timer"
          secondary
          onPress={() => {
            setDeadline(null);
            setRemaining(seconds);
          }}
        />
      </Row>
    </Card>
  );
}
function Cooking({
  version,
  title,
}: {
  version: RecipeVersion;
  title: string;
}) {
  useKeepAwake("feedr-cook", { suppressDeactivateWarnings: true });
  const [index, setIndex] = useState(0);
  const [ingredients, setIngredients] = useState(false);
  const steps = [...version.steps].sort((a, b) => a.position - b.position);
  const step: Step | undefined = steps[index];
  return (
    <>
      <T title>{title}</T>
      <T muted>{version.label}</T>
      <Button
        title={ingredients ? "Hide ingredients" : "Show ingredients"}
        secondary
        onPress={() => setIngredients(!ingredients)}
      />
      {ingredients && <Ingredients lines={version.ingredients} />}
      {step ? (
        <>
          <Card>
            <T title>
              Step {index + 1} of {steps.length}
            </T>
            {!!step.section && <T muted>{step.section}</T>}
            <T>{step.text}</T>
          </Card>
          {step.timer_seconds != null && (
            <Timer key={step.id} seconds={step.timer_seconds} />
          )}
          <Row>
            <Button
              title="Previous"
              secondary
              disabled={index === 0}
              onPress={() => setIndex(index - 1)}
            />
            <Button
              title="Next"
              disabled={index === steps.length - 1}
              onPress={() => setIndex(index + 1)}
            />
          </Row>
          {index === steps.length - 1 && (
            <T muted>Last step. Enjoy your meal.</T>
          )}
        </>
      ) : (
        <T muted>No cooking steps for this version.</T>
      )}
      <T muted>
        Keep this screen open while cooking. Timers run on this screen; no
        background notification is sent.
      </T>
    </>
  );
}
export default function CookScreen() {
  const { versionId, recipeId } = useLocalSearchParams<{
    versionId: string;
    recipeId: string;
  }>();
  const query = useApiQuery<Recipe>(
    ["recipe", recipeId],
    `/recipes/${recipeId}`,
  );
  const version = query.data?.versions.find((v) => v.id === versionId);
  return (
    <Screen>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {version && query.data && (
        <Cooking key={version.id} title={query.data.title} version={version} />
      )}
      {query.data && !version && <T>Recipe version not found.</T>}
    </Screen>
  );
}
