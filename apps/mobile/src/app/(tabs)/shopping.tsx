import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ShoppingList } from "@feedr/core";
import { useApiQuery, useStore } from "../../store";
import { useWeek, WeekStrip } from "../../dates";
import { Card, ErrorMessage, QueryState, Screen, T, num } from "../../ui";
function Checklist({
  storageKey,
  list,
}: {
  storageKey: string;
  list: ShoppingList;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (alive) {
          setChecked(raw ? (JSON.parse(raw) as Record<string, boolean>) : {});
          setReady(true);
        }
      })
      .catch(() => {
        if (alive) setError("Could not read shopping ticks.");
      });
    return () => {
      alive = false;
    };
  }, [storageKey]);
  function toggle(id: string) {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    writes.current = writes.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(storageKey, JSON.stringify(next)))
      .catch(() => setError("Could not save shopping ticks."));
  }
  const aisles = [...new Set(list.items.map((item) => item.aisle))];
  return (
    <>
      <ErrorMessage error={error} />
      {aisles.map((aisle) => (
        <Card key={aisle}>
          <T title>{aisle}</T>
          {list.items
            .filter((item) => item.aisle === aisle)
            .map((item) => (
              <Pressable
                key={item.ingredient_id}
                accessibilityRole="checkbox"
                aria-checked={!!checked[item.ingredient_id]}
                accessibilityLabel={item.ingredient}
                accessibilityState={{
                  checked: !!checked[item.ingredient_id],
                  disabled: !ready,
                }}
                disabled={!ready}
                onPress={() => toggle(item.ingredient_id)}
                style={{ paddingVertical: 9 }}
              >
                <View
                  style={{
                    opacity: checked[item.ingredient_id] ? 0.5 : 1,
                    gap: 3,
                  }}
                >
                  <T>
                    {checked[item.ingredient_id] ? "☑" : "☐"} {item.ingredient}
                    {item.optional ? " (optional)" : ""}
                  </T>
                  {item.amounts.length > 0 && (
                    <T>
                      {item.amounts
                        .map(
                          (amount) =>
                            `${num(amount.quantity)}${amount.unit ? ` ${amount.unit}` : ""}`,
                        )
                        .join(" + ")}
                    </T>
                  )}
                  {item.unquantified.map((line, i) => (
                    <T key={i}>{line}</T>
                  ))}
                  <T muted>{item.recipes.join(" · ")}</T>
                </View>
              </Pressable>
            ))}
        </Card>
      ))}
      {!list.items.length && <T muted>No shopping needed for this week.</T>}
    </>
  );
}
export default function ShoppingScreen() {
  const week = useWeek();
  const { connection } = useStore();
  const query = useApiQuery<ShoppingList>(
    ["shopping", week.start, week.end],
    `/shopping?start=${week.start}&end=${week.end}`,
  );
  const storageKey = `feedr.shopping:${connection?.url}:${connection?.userId}:${week.start}`;
  return (
    <Screen
      refresh={() => void query.refetch()}
      refreshing={query.isRefetching}
    >
      <WeekStrip week={week} />
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <Checklist key={storageKey} storageKey={storageKey} list={query.data} />
      )}
    </Screen>
  );
}
