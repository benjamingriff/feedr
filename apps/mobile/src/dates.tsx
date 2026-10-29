import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Row, T, colors } from "./ui";
export function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const today = () => iso(new Date());
export const asDate = (day: string) => new Date(`${day}T12:00:00`);
export function addDays(day: string, offset: number) {
  const d = asDate(day);
  d.setDate(d.getDate() + offset);
  return iso(d);
}
export function monday(day: string) {
  return addDays(day, -((asDate(day).getDay() + 6) % 7));
}
export function dateLabel(day: string, full = false) {
  return asDate(day).toLocaleDateString(undefined, {
    weekday: "short",
    ...(full ? { month: "short", day: "numeric" } : {}),
  });
}
export function useWeek() {
  const [selected, setSelected] = useState(today);
  const start = monday(selected);
  const end = addDays(start, 6);
  return {
    selected,
    setSelected,
    start,
    end,
    move: (offset: number) => setSelected(addDays(selected, offset * 7)),
  };
}
export function WeekStrip({ week }: { week: ReturnType<typeof useWeek> }) {
  return (
    <View style={{ gap: 12 }}>
      <Row>
        <Button
          title="‹ Previous week"
          secondary
          onPress={() => week.move(-1)}
        />
        <Button title="Next week ›" secondary onPress={() => week.move(1)} />
      </Row>
      <T>
        {dateLabel(week.start, true)} – {dateLabel(week.end, true)}
      </T>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {Array.from({ length: 7 }, (_, i) => {
          const day = addDays(week.start, i);
          const active = day === week.selected;
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityLabel={dateLabel(day, true)}
              accessibilityState={{ selected: active }}
              aria-selected={active}
              onPress={() => week.setSelected(day)}
              style={{
                flex: 1,
                paddingVertical: 10,
                alignItems: "center",
                backgroundColor: active ? colors.accent : "white",
                borderRadius: 7,
              }}
            >
              <Text
                style={{ color: active ? "white" : colors.text, fontSize: 12 }}
              >
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
              </Text>
              <Text
                style={{ color: active ? "white" : colors.text, fontSize: 16 }}
              >
                {asDate(day).getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
