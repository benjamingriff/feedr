import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { T, TextButton, colors } from "./ui";
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
  return asDate(day).toLocaleDateString("en-GB", {
    weekday: "short",
    ...(full ? { month: "short", day: "numeric" } : {}),
  });
}
export function useWeek() {
  const [selected, setSelected] = useState(today);
  const start = monday(selected);
  return {
    selected,
    setSelected,
    start,
    end: addDays(start, 6),
    move: (offset: number) => setSelected(addDays(selected, offset * 7)),
  };
}
export function WeekStrip({
  week,
  days,
}: {
  week: ReturnType<typeof useWeek>;
  days?: string[];
}) {
  const start = asDate(week.start),
    end = asDate(week.end);
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "short" });
  const label = `${month(start)} ${start.getDate()} – ${start.getMonth() === end.getMonth() ? "" : `${month(end)} `}${end.getDate()}`;
  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          onPress={() => week.move(-1)}
          style={{ padding: 10 }}
        >
          <T title>‹</T>
        </Pressable>
        <T>{label}</T>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next week"
          onPress={() => week.move(1)}
          style={{ padding: 10 }}
        >
          <T title>›</T>
        </Pressable>
        {week.start !== monday(today()) && (
          <TextButton
            title="This week"
            onPress={() => week.setSelected(today())}
          />
        )}
      </View>
      {days && (
        <View style={{ flexDirection: "row", gap: 4 }}>
          {Array.from({ length: 7 }, (_, i) => {
            const day = addDays(week.start, i),
              active = day === week.selected,
              isToday = day === today();
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={`${dateLabel(day, true)}${isToday ? ", today" : ""}${days.includes(day) ? ", meals planned" : ""}`}
                accessibilityState={{ selected: active }}
                onPress={() => week.setSelected(day)}
                style={{
                  flex: 1,
                  paddingVertical: 7,
                  alignItems: "center",
                  backgroundColor: active ? colors.accent : "white",
                  borderRadius: 8,
                  gap: 2,
                }}
              >
                <Text
                  style={{
                    color: active ? "white" : colors.muted,
                    fontSize: 11,
                  }}
                >
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                </Text>
                <Text
                  style={{
                    color: active ? "white" : colors.text,
                    fontSize: 16,
                    fontWeight: isToday ? "700" : "400",
                    textDecorationLine: isToday ? "underline" : "none",
                  }}
                >
                  {asDate(day).getDate()}
                </Text>
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: days.includes(day)
                      ? active
                        ? "white"
                        : colors.accent
                      : "transparent",
                  }}
                />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
