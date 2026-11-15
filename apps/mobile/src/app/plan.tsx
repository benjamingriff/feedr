import { useRef, useState, type ComponentRef } from "react";
import { Pressable, View, type ScrollView } from "react-native";
import { router } from "expo-router";
import { addDays, dayMonth, dayName, monday, today, weekRange } from "../dates";
import { joinNames, num } from "../format";
import { eaterLine, useWeek, type DayMeals, type Dish, type SlotMeals } from "../plan";
import { BackLink, Fill, Lane, PageHead, QueryState, Row, Screen, Text, TopBar } from "../primitives";
import { GUTTER, underline, useColors } from "../theme";

/** "← 17–23 Nov →" in the top bar. */
function WeekSwitcher({ start, onMove }: { start: string; onMove: (weeks: number) => void }) {
  const arrow = (glyph: string, label: string, weeks: number) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={12} onPress={() => onMove(weeks)}>
      <Text variant="quantity" color="ink3" style={{ lineHeight: 18 }}>
        {glyph}
      </Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      {arrow("←", "Previous week", -1)}
      <Text variant="label" color="ink2">
        {weekRange(start)}
      </Text>
      {arrow("→", "Next week", 1)}
    </View>
  );
}

/**
 * One dish in a slot. With one person the row ends in their kcal; with more, a line under the
 * title says who's eating and how much. Only the first dish in a slot carries the slot label.
 */
function MealRow({ slot, dish, first, rule, solo }: { slot: string; dish: Dish; first: boolean; rule: boolean; solo: boolean }) {
  return (
    <Row
      align="baseline"
      pad={9}
      rule={rule}
      label={`${slot}: ${dish.title}`}
      onPress={() => router.push({ pathname: "/recipe/[id]", params: { id: dish.recipeId, serviceId: dish.serviceId } })}
    >
      <Lane size="label">{first && <Text variant="label">{slot}</Text>}</Lane>
      <Fill style={{ gap: 2 }}>
        <Text variant="meal">{dish.title}</Text>
        {!solo && <Text variant="secondary">{eaterLine(dish.eaters)}</Text>}
        {!!dish.leftoverFrom && <Text variant="secondary">Leftovers from {dish.leftoverFrom}</Text>}
      </Fill>
      {solo && (
        <Lane size="kcal">
          <Text variant="mealKcal">{num(dish.eaters[0]?.kcal)}</Text>
        </Lane>
      )}
    </Row>
  );
}

/** "+ Add dinner": opens the cookbook to pick a recipe for this date and slot. */
function EmptyRow({ slot, date, rule, solo }: { slot: SlotMeals["slot"]; date: string; rule: boolean; solo: boolean }) {
  return (
    <Row
      align="baseline"
      pad={9}
      rule={rule}
      label={`Add ${slot}`}
      onPress={() => router.push({ pathname: "/cookbook", params: { date, slot } })}
    >
      <Lane size="label">
        <Text variant="label">{slot}</Text>
      </Lane>
      <Fill>
        <Text variant="meal" color="ink3" style={[underline("dotted", 4), { alignSelf: "flex-start" }]}>
          + Add {slot}
        </Text>
      </Fill>
      {solo && (
        <Lane size="kcal">
          <Text variant="mealKcal" color="ink3">
            —
          </Text>
        </Lane>
      )}
    </Row>
  );
}

function DaySection({ day, solo, onLayout }: { day: DayMeals; solo: boolean; onLayout: (y: number) => void }) {
  const colors = useColors();
  const isToday = day.date === today();
  const soFar = day.complete ? "" : " so far";
  let row = 0;
  return (
    <View
      onLayout={(e) => onLayout(e.nativeEvent.layout.y)}
      style={{
        borderTopWidth: isToday ? 2 : 1,
        borderTopColor: isToday ? colors.accent : colors.line,
        paddingTop: 18,
        paddingBottom: 14,
        paddingHorizontal: GUTTER,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingBottom: solo ? 8 : 0 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text variant="dayName" color={isToday ? "accent" : "ink"} accessibilityRole="header">
            {dayName(day.date)}
          </Text>
          <Text variant="meal" color="ink3" style={{ lineHeight: 26 }}>
            {dayMonth(day.date)}
          </Text>
          {isToday && (
            <Text variant="tag" color="accent">
              · Today
            </Text>
          )}
        </View>
        {solo && (
          <Text variant="dayTotal" color={day.complete ? "ink" : "ink3"}>
            {num(day.totals[0]?.kcal)} kcal{soFar}
          </Text>
        )}
      </View>
      {!solo && (
        <Text variant="mealKcal" color={day.complete ? "ink2" : "ink3"} style={{ paddingTop: 4, paddingBottom: 8 }}>
          {eaterLine(day.totals)} kcal{soFar}
        </Text>
      )}
      {day.slots.flatMap((slot) =>
        slot.dishes.length ? (
          slot.dishes.map((dish, i) => (
            <MealRow key={dish.serviceId} slot={slot.slot} dish={dish} first={i === 0} rule={row++ > 0} solo={solo} />
          ))
        ) : (
          <EmptyRow key={slot.slot} slot={slot.slot} date={day.date} rule={row++ > 0} solo={solo} />
        ),
      )}
    </View>
  );
}

export default function PlanScreen() {
  const thisWeek = monday(today());
  const [start, setStart] = useState(thisWeek);
  const { query, week } = useWeek(start);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // Opening on the current week lands on today, once.
  const landed = useRef(false);

  const weeksAway = Math.round((Date.parse(start) - Date.parse(thisWeek)) / (7 * 86_400_000));
  const title = weeksAway === 0 ? "This week" : weeksAway === 1 ? "Next week" : weeksAway === -1 ? "Last week" : weekRange(start);
  const solo = (week?.people.length ?? 0) < 2;
  const left = week?.mealsLeft ?? 0;
  const subtitle = !week
    ? undefined
    : !week.people.length
      ? "Add a person to start planning."
      : `${left ? `${left} ${left === 1 ? "meal" : "meals"} left to plan` : "Every meal is planned"} · ${
          solo ? `${num(week.people[0]?.targetKcal)} kcal a day` : `for ${joinNames(week.people.map((p) => p.name))}`
        }`;

  return (
    <Screen scrollRef={scroll} refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <TopBar
        left={<BackLink label="Home" flush />}
        right={<WeekSwitcher start={start} onMove={(weeks) => setStart(addDays(start, weeks * 7))} />}
      />
      <PageHead compact title={title} lede={subtitle} style={{ paddingBottom: 26 }} />
      <QueryState query={query} />
      {week?.days.map((day) => (
        <DaySection
          key={day.date}
          day={day}
          solo={solo}
          onLayout={(y) => {
            if (landed.current || day.date !== today()) return;
            landed.current = true;
            // Monday needs no scroll; later days go to the top of the screen.
            if (day.date !== start) scroll.current?.scrollTo({ y, animated: false });
          }}
        />
      ))}
    </Screen>
  );
}
