import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Recipe, RecipeVersion, Step } from "@feedr/core";
import { capitalise, minutes } from "../../format";
import {
  BrandMark,
  Chip,
  Gutter,
  PrimaryButton,
  QueryState,
  SectionHeader,
  SquareButton,
  StateLine,
  Text,
  TopBar,
  WEB,
} from "../../primitives";
import { IngredientRow, prepLine, splitNote, stepAmount, stepIngredients, stepNumber, stepPieces } from "../../recipe-parts";
import { useApiQuery } from "../../store";
import { GUTTER, mono, sans, underline, useColors } from "../../theme";

/** A step's countdown: `endsAt` while running, `left` seconds while paused or finished. */
type Timer = { endsAt: number | null; left: number };

/**
 * The timer chip. Tap to start, tap again to pause; it reads "Done" in accent at zero.
 * The countdown is measured against the clock, so a busy screen can't make it drift.
 */
function TimerChip({ seconds, timer, onChange }: { seconds: number; timer?: Timer; onChange: (timer: Timer) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const left = !timer ? seconds : timer.endsAt == null ? timer.left : Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  const running = timer?.endsAt != null && left > 0;
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [running]);

  const label = !timer
    ? `◷ Timer · ${minutes(Math.round(seconds / 60))}`
    : left === 0
      ? "◷ Done"
      : `◷ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <Chip
      kind="timer"
      label={label}
      active={!!timer && left === 0}
      onPress={() => {
        if (left === 0) return;
        const pressed = Date.now();
        setNow(pressed);
        onChange(running ? { endsAt: null, left } : { endsAt: pressed + left * 1000, left });
      }}
    />
  );
}

function Cooking({ recipe, version, serviceId }: { recipe: Recipe; version: RecipeVersion; serviceId?: string }) {
  useKeepAwake("feedr-cook", { suppressDeactivateWarnings: true });
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  // The ingredient line highlighted in "For this step".
  const [active, setActive] = useState<string | null>(null);
  // Kept per step, so going back to a step shows its timer still running.
  const [timers, setTimers] = useState<Record<string, Timer>>({});

  const steps = version.steps;
  const step: Step | undefined = steps[index];
  const go = (to: number) => {
    setIndex(to);
    setActive(null);
  };
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!step)
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <CookBar onClose={close} />
        <StateLine text="This version has no steps" />
      </View>
    );

  const { lines, terms } = stepIngredients(step, version);
  const isLast = index === steps.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <CookBar onClose={close} />
      <Gutter style={{ flexDirection: "row", gap: 4 }}>
        {steps.map((s, i) => (
          <View key={s.id} style={{ flex: 1, height: 3, backgroundColor: i <= index ? colors.accent : colors.line }} />
        ))}
      </Gutter>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={!WEB}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 28, paddingBottom: 24 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingBottom: 18 }}>
          <Chip label={`STEP ${stepNumber(index)} / ${String(steps.length).padStart(2, "0")}`} />
          <Text variant="chip" numberOfLines={1} style={{ flexShrink: 1 }}>
            {recipe.title}
          </Text>
        </View>
        <Text variant="cookStep">
          {stepPieces(step.text, terms).map((piece, i) => {
            if (piece.duration)
              return (
                <Text key={i} variant="cookStep" style={{ fontFamily: sans[600] }}>
                  {piece.text}
                </Text>
              );
            if (!piece.term) return piece.text;
            const { line } = piece.term;
            const on = active === line.id;
            return (
              <Text
                key={i}
                variant="cookStep"
                accessibilityRole="button"
                accessibilityLabel={`${piece.text}: ${on ? "hide" : "show"} in the ingredients`}
                onPress={() => setActive(on ? null : line.id)}
              >
                <Text variant="cookStep" color={on ? "accent" : "ink"} style={underline(on ? "solid" : "dotted", 5)}>
                  {piece.text}
                </Text>
                <Text variant="cookStep" color="accent" style={{ fontFamily: mono[400], fontSize: 17 }}>
                  {on ? "−" : "+"}
                </Text>
              </Text>
            );
          })}
        </Text>
        {step.timer_seconds != null && (
          <View style={{ paddingTop: 14 }}>
            <TimerChip
              seconds={step.timer_seconds}
              timer={timers[step.id]}
              onChange={(timer) => setTimers({ ...timers, [step.id]: timer })}
            />
          </View>
        )}
        {lines.length > 0 && (
          <View style={{ paddingTop: 28 }}>
            <SectionHeader title="For this step" meta={`${lines.length} of ${version.ingredients.length}`} gap={10} />
            {lines.map((line, i) => {
              const on = active === line.id;
              const prep = prepLine(line);
              const note = on ? splitNote(step, line, version) : "";
              return (
                <IngredientRow
                  key={line.id}
                  quantity={stepAmount(step, line)}
                  name={capitalise(line.ingredient)}
                  highlight={on}
                  last={i === lines.length - 1}
                  detail={
                    prep || note ? (
                      <>
                        {prep}
                        {!!note && (
                          <Text variant="secondary" color="ink2">
                            {prep ? note : note.replace(/^ · /, "")}
                          </Text>
                        )}
                      </>
                    ) : undefined
                  }
                />
              );
            })}
          </View>
        )}
      </ScrollView>
      <Gutter style={{ flexDirection: "row", gap: 10, paddingTop: 12, paddingBottom: Math.max(40, insets.bottom + 6) }}>
        <SquareButton glyph="←" label="Previous step" disabled={index === 0} onPress={() => go(index - 1)} />
        <PrimaryButton
          tall
          style={{ flex: 1 }}
          label={isLast ? (serviceId ? "Finish · Dish up" : "Finish") : `Next · Step ${stepNumber(index + 1)}`}
          onPress={() => {
            if (!isLast) return go(index + 1);
            // Finishing a planned meal swaps cook mode for its dish-up screen.
            if (serviceId) router.replace({ pathname: "/service/[id]", params: { id: serviceId } });
            else close();
          }}
        />
      </Gutter>
    </View>
  );
}

function CookBar({ onClose }: { onClose: () => void }) {
  return (
    <TopBar
      left={<BrandMark label="Cook" />}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close cook mode"
          hitSlop={12}
          onPress={onClose}
          style={{ paddingTop: 6, paddingBottom: 4 }}
        >
          <Text variant="label">Close ✕</Text>
        </Pressable>
      }
    />
  );
}

/** Cook mode: one step at a time, full screen, with the screen kept awake. */
export default function CookScreen() {
  const { versionId, recipeId, serviceId } = useLocalSearchParams<{ versionId: string; recipeId: string; serviceId?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const query = useApiQuery<Recipe>(["recipe", recipeId], `/recipes/${recipeId}`);
  const version = query.data?.versions.find((v) => v.id === versionId);
  if (query.data && version) return <Cooking key={version.id} recipe={query.data} version={version} serviceId={serviceId} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <CookBar onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <QueryState query={query} />
      {query.data && <StateLine text="That version is no longer in the recipe" />}
    </View>
  );
}
