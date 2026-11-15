import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_SLOT_SPLIT, SLOTS, type Person, type Slot } from "@feedr/core";
import { capitalise } from "../../format";
import {
  BackLink,
  ErrorLine,
  Field,
  Gutter,
  PageHead,
  PrimaryButton,
  QueryState,
  Screen,
  SectionHeader,
  TextAction,
  TopBar,
  confirmAction,
} from "../../primitives";
import { useApiQuery, useStore } from "../../store";

/** A blank string is "not set"; anything else must be a number. */
function optionalNumber(text: string, what: string) {
  if (!text.trim()) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${what} must be a number.`);
  return n;
}

function PersonForm({ person }: { person?: Person }) {
  const { api } = useStore();
  const client = useQueryClient();
  const [name, setName] = useState(person?.name ?? "");
  const [weight, setWeight] = useState(person?.weight_kg?.toString() ?? "");
  const [kcal, setKcal] = useState(person?.daily_kcal.toString() ?? "2000");
  const [protein, setProtein] = useState(person?.daily_protein_g?.toString() ?? "");
  const split = person?.slot_split ?? DEFAULT_SLOT_SPLIT;
  // The split is edited as whole percentages and stored as fractions.
  const [percent, setPercent] = useState(
    Object.fromEntries(SLOTS.map((slot) => [slot, String(Math.round(split[slot] * 100))])) as Record<Slot, string>,
  );
  const total = SLOTS.reduce((sum, slot) => sum + Number(percent[slot]), 0);

  const done = async () => {
    await client.invalidateQueries();
    if (router.canGoBack()) router.back();
    else router.replace("/people");
  };
  const save = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error("Enter a name.");
      const dailyKcal = Number(kcal);
      if (!Number.isInteger(dailyKcal) || dailyKcal <= 0) throw new Error("Daily kcal must be a whole number above zero.");
      if (SLOTS.some((slot) => !percent[slot].trim() || !(Number(percent[slot]) >= 0)) || Math.abs(total - 100) > 0.001)
        throw new Error(`The slot split must add up to 100%. It adds up to ${Number.isFinite(total) ? total : "?"}%.`);
      return api<Person>(
        person ? `/people/${person.id}` : "/people",
        {
          name: name.trim(),
          weight_kg: optionalNumber(weight, "Weight") || null,
          daily_kcal: dailyKcal,
          daily_protein_g: optionalNumber(protein, "Daily protein"),
          slot_split: Object.fromEntries(SLOTS.map((slot) => [slot, Number(percent[slot]) / 100])),
        },
        person ? "PATCH" : "POST",
      );
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => api<void>(`/people/${person!.id}`, undefined, "DELETE"),
    onSuccess: done,
  });
  const busy = save.isPending || remove.isPending;

  return (
    <>
      <PageHead title={person ? person.name : "Add person"} lede="Daily targets size each portion." />
      <Gutter>
        <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" style={{ paddingTop: 0 }} />
        <Field label="Weight" suffix="kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="Optional" />
        <Field label="Daily kcal" suffix="kcal" value={kcal} onChangeText={setKcal} keyboardType="number-pad" />
        <Field label="Daily protein" suffix="g" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" placeholder="Optional" />
        <View style={{ paddingTop: 36 }}>
          <SectionHeader title="Slot split" meta={`${Number.isFinite(total) ? total : "?"}% of the day`} />
          <View style={{ flexDirection: "row", gap: 16 }}>
            {SLOTS.map((slot) => (
              <Field
                key={slot}
                label={slot === "snack" ? "Snacks" : capitalise(slot)}
                suffix="%"
                value={percent[slot]}
                onChangeText={(value) => setPercent({ ...percent, [slot]: value })}
                keyboardType="decimal-pad"
                style={{ flex: 1 }}
              />
            ))}
          </View>
        </View>
        <ErrorLine error={save.error ?? remove.error} />
        <PrimaryButton label={save.isPending ? "Saving…" : "Save"} disabled={busy} onPress={() => save.mutate()} style={{ marginTop: 28 }} />
        {person && (
          <TextAction
            label="Delete"
            disabled={busy}
            style={{ marginTop: 20 }}
            onPress={() =>
              confirmAction(
                `Delete ${person.name}?`,
                "They'll no longer appear on the plan. Meals already planned keep their portions.",
                "Delete",
                () => remove.mutate(),
              )
            }
          />
        )}
      </Gutter>
    </>
  );
}

/** Add or edit a person. The id "new" adds one. */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useApiQuery<Person[]>(["people"], "/people");
  const person = query.data?.find((p) => p.id === id);
  return (
    <Screen>
      <TopBar left={<BackLink label="People" fallback="/people" />} />
      {id === "new" ? (
        <PersonForm />
      ) : (
        <>
          <QueryState query={query} />
          {person && <PersonForm key={person.id} person={person} />}
        </>
      )}
    </Screen>
  );
}
