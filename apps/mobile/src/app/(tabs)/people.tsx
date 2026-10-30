import { useState } from "react";
import { Pressable, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { SLOTS, type Person, type Slot } from "@feedr/core";
import { useApiQuery, useStore } from "../../store";
import {
  Button,
  Card,
  ErrorMessage,
  Field,
  QueryState,
  Row,
  Screen,
  T,
  num,
  pct,
  Chevron,
  s,
} from "../../ui";
const slots = SLOTS;
function PersonForm({ person, close }: { person?: Person; close: () => void }) {
  const { api } = useStore();
  const client = useQueryClient();
  const [name, setName] = useState(person?.name ?? "");
  const [weight, setWeight] = useState(person?.weight_kg?.toString() ?? "");
  const [kcal, setKcal] = useState(person?.daily_kcal.toString() ?? "2000");
  const [protein, setProtein] = useState(
    person?.daily_protein_g?.toString() ?? "",
  );
  const [split, setSplit] = useState<Record<Slot, string>>({
    breakfast: String((person?.slot_split.breakfast ?? 0.25) * 100),
    lunch: String((person?.slot_split.lunch ?? 0.3) * 100),
    dinner: String((person?.slot_split.dinner ?? 0.35) * 100),
    snack: String((person?.slot_split.snack ?? 0.1) * 100),
  });
  const sum = slots.reduce((total, slot) => total + Number(split[slot]), 0);
  const mutation = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error("Enter a name.");
      const dailyKcal = Number(kcal);
      const weightKg = weight.trim() ? Number(weight) : null;
      const dailyProtein = protein.trim() ? Number(protein) : null;
      if (!Number.isInteger(dailyKcal) || dailyKcal <= 0)
        throw new Error("Daily kcal must be a positive whole number.");
      if (weightKg != null && (!Number.isFinite(weightKg) || weightKg <= 0))
        throw new Error("Weight must be greater than zero.");
      if (
        dailyProtein != null &&
        (!Number.isFinite(dailyProtein) || dailyProtein < 0)
      )
        throw new Error("Protein must be zero or greater.");
      if (
        !Number.isFinite(sum) ||
        Math.abs(sum - 100) > 0.001 ||
        slots.some(
          (slot) =>
            !split[slot].trim() ||
            Number(split[slot]) < 0 ||
            Number(split[slot]) > 100,
        )
      )
        throw new Error(
          "The four slot percentages must be between 0 and 100 and add up to 100%.",
        );
      return api<Person>(
        person ? `/people/${person.id}` : "/people",
        {
          name: name.trim(),
          weight_kg: weightKg,
          daily_kcal: dailyKcal,
          daily_protein_g: dailyProtein,
          slot_split: Object.fromEntries(
            slots.map((slot) => [slot, Number(split[slot]) / 100]),
          ),
        },
        person ? "PATCH" : "POST",
      );
    },
    onSuccess: () => {
      void client.invalidateQueries();
      close();
    },
  });
  return (
    <Card>
      <T title>{person ? "Edit person" : "Add person"}</T>
      <Field label="Name" value={name} onChangeText={setName} />
      <Field
        label="Weight (kg, optional)"
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
      />
      <Field
        label="Daily kcal"
        value={kcal}
        onChangeText={setKcal}
        keyboardType="number-pad"
      />
      <Field
        label="Daily protein (g, optional)"
        value={protein}
        onChangeText={setProtein}
        keyboardType="decimal-pad"
      />
      <T>Meal slot split · total {num(sum)}%</T>
      {slots.map((slot) => (
        <Field
          key={slot}
          label={`${slot} (%)`}
          value={split[slot]}
          onChangeText={(value) => setSplit({ ...split, [slot]: value })}
          keyboardType="decimal-pad"
        />
      ))}
      <ErrorMessage error={mutation.error} />
      <Row>
        <Button
          title={mutation.isPending ? "Saving…" : "Save person"}
          disabled={mutation.isPending}
          onPress={() => mutation.mutate()}
        />
        <Button
          title="Cancel"
          secondary
          disabled={mutation.isPending}
          onPress={close}
        />
      </Row>
    </Card>
  );
}
function Settings() {
  const { api, connection, disconnect } = useStore();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api<{ token: string }>("/me/tokens", { name: "Agent token" }),
    onSuccess: (result) => {
      setToken(result.token);
      setCopied("");
    },
  });
  const command = `claude mcp add --transport http feedr ${connection?.url}/mcp --header "Authorization: Bearer ${token}"`;
  async function copy(value: string, label: string) {
    try {
      await Clipboard.setStringAsync(value);
      setCopied(label);
    } catch {
      setError(
        "Could not copy to the clipboard. Select and copy the text manually.",
      );
    }
  }
  return (
    <>
      <T small muted>
        Settings
      </T>
      <Card>
        <T>API URL</T>
        <T muted>{connection?.url}</T>
        <Button
          title={connection?.auth === "clerk" ? "Sign out" : "Disconnect"}
          secondary
          onPress={() => {
            void disconnect().catch((e) => setError(String(e)));
          }}
        />
      </Card>
      <T small muted>
        Agent access
      </T>
      <Card>
        <Button
          title={create.isPending ? "Creating…" : "Create agent token"}
          disabled={create.isPending || !!token}
          onPress={() => create.mutate()}
        />
        <ErrorMessage error={create.error ?? error} />
        {!!token && (
          <>
            <T>
              Save this token now. It is shown only here and cannot be retrieved
              later.
            </T>
            <Field
              label="Agent token"
              value={token}
              editable={false}
              multiline
            />
            <Button
              title="Copy token"
              secondary
              onPress={() => {
                void copy(token, "Token copied");
              }}
            />
            <Field
              label="Claude MCP command"
              value={command}
              editable={false}
              multiline
            />
            <Button
              title="Copy command"
              secondary
              onPress={() => {
                void copy(command, "Command copied");
              }}
            />
            <T muted>{copied}</T>
            <Button
              title="Done — hide token"
              secondary
              onPress={() => setToken("")}
            />
          </>
        )}
      </Card>
    </>
  );
}
export default function PeopleScreen() {
  const query = useApiQuery<Person[]>(["people"], "/people");
  const [editing, setEditing] = useState<Person | "new" | null>(null);
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
      <View style={s.group}>
        {query.data?.map((person) => (
          <Pressable
            key={person.id}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${person.name}`}
            onPress={() => setEditing(person)}
            style={s.listRow}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <T style={{ fontWeight: "600" }}>{person.name}</T>
              <T small>
                {num(person.weight_kg, 1)} kg · {num(person.daily_kcal)} kcal ·{" "}
                {num(person.daily_protein_g)} g protein
              </T>
              <T small muted>
                {slots
                  .map(
                    (slot) =>
                      `${slot === "snack" ? "Snacks" : slot.charAt(0).toUpperCase() + slot.slice(1)} ${pct(person.slot_split[slot])}`,
                  )
                  .join(" · ")}
              </T>
            </View>
            <Chevron />
          </Pressable>
        ))}
      </View>
      {query.data?.length === 0 && <T muted>Add the people you cook for.</T>}
      {editing ? (
        <PersonForm
          key={editing === "new" ? "new" : editing.id}
          person={editing === "new" ? undefined : editing}
          close={() => setEditing(null)}
        />
      ) : (
        <Button
          title="Add person"
          secondary
          onPress={() => setEditing("new")}
        />
      )}
      <Settings />
    </Screen>
  );
}
