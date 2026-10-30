import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ShoppingList } from "@feedr/core";
import { useApiQuery, useStore } from "../../store";
import { useWeek, WeekStrip } from "../../dates";
import {
  ErrorMessage,
  QueryState,
  Screen,
  T,
  TextButton,
  Tag,
  num,
  s,
} from "../../ui";
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
  function persist(next: Record<string, boolean>) {
    setChecked(next);
    writes.current = writes.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(storageKey, JSON.stringify(next)))
      .catch(() => setError("Could not save shopping ticks."));
  }
  function toggle(id: string) {
    persist({ ...checked, [id]: !checked[id] });
  }
  const aisles = [...new Set(list.items.map((item) => item.aisle))];
  return (
    <>
      <ErrorMessage error={error} />
      <View style={s.spread}>
        <T small muted>
          {list.items.length} items ·{" "}
          {list.items.filter((i) => checked[i.ingredient_id]).length} ticked
        </T>
        <TextButton
          title="Clear ticks"
          disabled={!ready || !Object.values(checked).some(Boolean)}
          onPress={() => persist({})}
        />
      </View>
      {aisles.map((aisle) => (
        <View key={aisle} style={{ gap: 5 }}>
          <T small muted style={{ textTransform: "capitalize" }}>
            {aisle}
          </T>
          <View style={s.group}>
            {list.items
              .filter((item) => item.aisle === aisle)
              .map((item) => {
                const ticked = !!checked[item.ingredient_id];
                return (
                  <Pressable
                    key={item.ingredient_id}
                    accessibilityRole="checkbox"
                    aria-checked={ticked}
                    accessibilityLabel={item.ingredient}
                    accessibilityState={{ checked: ticked, disabled: !ready }}
                    disabled={!ready}
                    onPress={() => toggle(item.ingredient_id)}
                    style={[s.listRow, { paddingVertical: 9 }]}
                  >
                    <View
                      style={{
                        width: 21,
                        height: 21,
                        borderWidth: 1,
                        borderColor: ticked ? "#236b50" : "#a8b2ab",
                        borderRadius: 5,
                        backgroundColor: ticked ? "#236b50" : "white",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <T small style={{ color: "white" }}>
                        {ticked ? "✓" : ""}
                      </T>
                    </View>
                    <View
                      style={{ flex: 1, opacity: ticked ? 0.45 : 1, gap: 2 }}
                    >
                      <View style={s.spread}>
                        <T
                          style={{
                            flex: 1,
                            textDecorationLine: ticked
                              ? "line-through"
                              : "none",
                          }}
                        >
                          {item.ingredient}
                        </T>
                        <T
                          small
                          style={{
                            textAlign: "right",
                            maxWidth: "48%",
                            textDecorationLine: ticked
                              ? "line-through"
                              : "none",
                          }}
                        >
                          {[
                            ...item.amounts.map(
                              (a) =>
                                `${num(a.quantity, a.unit === "g" ? 0 : 6)}${a.unit ? ` ${a.unit}` : ""}`,
                            ),
                            ...item.unquantified,
                          ].join(" + ")}
                        </T>
                      </View>
                      <T small muted numberOfLines={1}>
                        {item.recipes.join(" · ")}
                      </T>
                      {item.optional && <Tag>Optional</Tag>}
                    </View>
                  </Pressable>
                );
              })}
          </View>
        </View>
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
