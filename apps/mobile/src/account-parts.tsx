import type { ReactNode } from "react";
import { View } from "react-native";
import { ArrowLane, Fill, Row, Text } from "./primitives";
import { mono, useColors } from "./theme";

// Pieces shared by the account screens.

/** "Ben Griffiths" → "BG", "Ben" → "B". */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]!.toUpperCase())
    .join("");
}

/** The account square with your initials: filled at the top of Account, outlined in lists. */
export function Monogram({ name, size = 30, filled = false }: { name: string; size?: number; filled?: boolean }) {
  const colors = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: filled ? 0 : 1,
        borderColor: colors.ink,
        backgroundColor: filled ? colors.accentFill : "transparent",
      }}
    >
      <Text
        variant="label"
        color={filled ? "onAccent" : "ink"}
        style={{ fontFamily: mono[500], fontSize: size > 40 ? 20 : 12, lineHeight: size > 40 ? 24 : 16 }}
      >
        {initials(name) || "?"}
      </Text>
    </View>
  );
}

/**
 * A settings row: title and optional detail, then a value, a control, or an arrow when it
 * opens something. The first row under a ruled header passes `rule={false}`.
 */
export function SettingRow({
  title,
  detail,
  value,
  control,
  onPress,
  rule = true,
  last = false,
  tone = "ink",
}: {
  title: string;
  detail?: string;
  value?: string;
  control?: ReactNode;
  onPress?: () => void;
  rule?: boolean;
  last?: boolean;
  /** "accent" for destructive rows. */
  tone?: "ink" | "accent";
}) {
  return (
    <Row pad={14} align="center" gap={12} rule={rule} last={last} onPress={onPress} label={title}>
      <Fill style={{ gap: 1 }}>
        <Text variant="itemName" color={tone}>
          {title}
        </Text>
        {!!detail && <Text variant="secondary">{detail}</Text>}
      </Fill>
      {!!value && <Text variant="indexSub">{value}</Text>}
      {control}
      {onPress && <ArrowLane />}
    </Row>
  );
}
