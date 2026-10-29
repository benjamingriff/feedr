import { router } from "expo-router";
import { SLOTS, type Plan } from "@feedr/core";
import { useApiQuery } from "../../store";
import { useWeek, WeekStrip, dateLabel } from "../../dates";
import { Bar, Button, Card, QueryState, Screen, T, num } from "../../ui";
const slots = SLOTS;
export default function PlanScreen() {
  const week = useWeek();
  const query = useApiQuery<Plan>(
    ["plan", week.start, week.end],
    `/plan?start=${week.start}&end=${week.end}`,
  );
  const day = query.data?.days.find((d) => d.date === week.selected);
  return (
    <Screen
      refresh={() => void query.refetch()}
      refreshing={query.isRefetching}
    >
      <WeekStrip week={week} />
      <T title>{dateLabel(week.selected, true)}</T>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {day?.people.map((person) => (
        <Card key={person.person_id}>
          <T title>{person.name}</T>
          <Bar
            label="Energy"
            value={person.totals.kcal}
            target={person.target_kcal}
            unit=" kcal"
          />
          <Bar
            label="Protein"
            value={person.totals.protein_g}
            target={person.target_protein_g}
            unit=" g"
          />
          {[...person.meals]
            .sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot))
            .map((meal) => (
              <Card
                key={meal.portion_id}
                label={`Dish up ${meal.slot}: ${meal.recipe_title}`}
                onPress={() => router.push(`/service/${meal.service_id}`)}
              >
                <T>
                  {meal.slot} · {meal.recipe_title}
                </T>
                <T muted>
                  {meal.version_label} · {num(meal.nutrition.kcal)} kcal ·{" "}
                  {num(meal.nutrition.protein_g)} g protein
                </T>
                <T muted>Dish up ›</T>
              </Card>
            ))}
          {!person.meals.length && <T muted>No meals planned for this day.</T>}
        </Card>
      ))}
      {query.data && !day?.people.length && (
        <T muted>Add a person in People to see their daily plan.</T>
      )}
      {!!query.data?.unassigned.length && (
        <>
          <T title>Unassigned leftovers</T>
          {query.data.unassigned.map((portion) => (
            <Card key={portion.id}>
              <T>
                {num(portion.nutrition.kcal)} kcal ·{" "}
                {num(portion.nutrition.protein_g)} g protein
              </T>
              <Button
                title="View leftover service"
                secondary
                onPress={() => router.push(`/service/${portion.service_id}`)}
              />
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
