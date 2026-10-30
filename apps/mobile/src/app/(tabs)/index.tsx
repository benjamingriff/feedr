import { router } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { View } from "react-native";
import { SLOTS, type Plan, type PlanMeal, type Service } from "@feedr/core";
import { useApiQuery, useStore } from "../../store";
import { useWeek, WeekStrip, dateLabel } from "../../dates";
import {
  Bar,
  Card,
  Chevron,
  QueryState,
  Screen,
  T,
  Tag,
  num,
  s,
} from "../../ui";
export default function PlanScreen() {
  const week = useWeek();
  const { api, connection } = useStore();
  const query = useApiQuery<Plan>(
    ["plan", week.start, week.end],
    `/plan?start=${week.start}&end=${week.end}`,
  );
  const day = query.data?.days.find((d) => d.date === week.selected);
  // Plan meals do not include cook dates; reuse the service cache for accurate leftover labels.
  const ids = [
    ...new Set(
      day?.people.flatMap((p) => p.meals.map((m) => m.service_id)) ?? [],
    ),
  ];
  const services = useQueries({
    queries: ids.map((id) => ({
      queryKey: [connection?.url, connection?.userId, "service", id],
      queryFn: () => api<Service>(`/services/${id}`),
      staleTime: 60_000,
    })),
  });
  const cookDates = new Map(
    services.flatMap((q) =>
      q.data ? [[q.data.id, q.data.cook_date] as const] : [],
    ),
  );
  const meals = new Map<
    string,
    { meal: PlanMeal; people: { name: string; kcal: number | null }[] }
  >();
  for (const person of day?.people ?? [])
    for (const meal of person.meals) {
      const key = `${meal.service_id}:${meal.slot}`;
      const group = meals.get(key) ?? { meal, people: [] };
      group.people.push({ name: person.name, kcal: meal.nutrition.kcal });
      meals.set(key, group);
    }
  return (
    <Screen
      refresh={() => void query.refetch()}
      refreshing={query.isRefetching}
    >
      <WeekStrip
        week={week}
        days={
          query.data?.days
            .filter((d) => d.people.some((p) => p.meals.length))
            .map((d) => d.date) ?? []
        }
      />
      <T title>{dateLabel(week.selected, true)}</T>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {!!day?.people.length && (
        <Card>
          <T small muted>
            Day totals
          </T>
          {day.people.map((person, i) => (
            <View
              key={person.person_id}
              style={{
                gap: 6,
                ...(i
                  ? {
                      borderTopWidth: 0.5,
                      borderColor: "#d9dfdb",
                      paddingTop: 8,
                    }
                  : {}),
              }}
            >
              <T style={{ fontWeight: "600" }}>{person.name}</T>
              <Bar
                label=""
                value={person.totals.kcal}
                target={person.target_kcal}
                unit=" kcal"
              />
              <Bar
                label="protein"
                value={person.totals.protein_g}
                target={person.target_protein_g}
                unit=" g"
              />
            </View>
          ))}
        </Card>
      )}
      {SLOTS.map((slot) => {
        const groups = [...meals.values()].filter((g) => g.meal.slot === slot);
        return groups.length ? (
          <View key={slot} style={{ gap: 6 }}>
            <T small muted>
              {slot === "snack"
                ? "Snacks"
                : slot.charAt(0).toUpperCase() + slot.slice(1)}
            </T>
            <View style={s.group}>
              {groups.map(({ meal, people }) => {
                const cooked = cookDates.get(meal.service_id);
                return (
                  <Card
                    key={meal.service_id}
                    label={`${meal.recipe_title}, ${slot}`}
                    onPress={() => router.push(`/service/${meal.service_id}`)}
                  >
                    <View style={s.spread}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <T style={{ fontWeight: "600" }}>{meal.recipe_title}</T>
                        <T small muted numberOfLines={1}>
                          {meal.version_label}
                        </T>
                        <T small>
                          {people
                            .map((p) => `${p.name} ${num(p.kcal)} kcal`)
                            .join(" · ")}
                        </T>
                        {cooked && cooked !== week.selected && (
                          <Tag>Leftovers from {dateLabel(cooked)}</Tag>
                        )}
                      </View>
                      <Chevron />
                    </View>
                  </Card>
                );
              })}
            </View>
          </View>
        ) : null;
      })}
      {query.data && !meals.size && <T muted>Nothing planned</T>}
      {!!query.data?.unassigned.length && (
        <>
          <T title>Unassigned leftovers</T>
          {query.data.unassigned.map((portion) => (
            <Card
              key={portion.id}
              onPress={() => router.push(`/service/${portion.service_id}`)}
              label="View leftover service"
            >
              <View style={s.spread}>
                <T>
                  {num(portion.nutrition.kcal)} kcal ·{" "}
                  {num(portion.nutrition.protein_g)} g protein
                </T>
                <Chevron />
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
