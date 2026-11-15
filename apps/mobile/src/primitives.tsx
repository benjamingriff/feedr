import type { ComponentRef, ReactNode, Ref } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps as RNTextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  GUTTER,
  lane,
  mono,
  sans,
  type,
  underline,
  useColors,
  type ColorName,
  type TypeRole,
} from "./theme";

// The building blocks from design/README.md's Components section. Screens are composed from
// these; they should rarely need a raw colour, font or hairline of their own.

/** Text in one of the design's type roles. `color` overrides the role's default token. */
export function Text({
  variant,
  color,
  style,
  ...props
}: RNTextProps & { variant: TypeRole; color?: ColorName }) {
  const colors = useColors();
  const { color: roleColor, ...role } = type[variant];
  return <RNText {...props} style={[role, { color: colors[color ?? roleColor] }, style]} />;
}

/**
 * A full-height screen: safe-area top inset, then scrolling content with pull-to-refresh.
 * `footer` is pinned below the scroll area. Content sets its own gutters, so sections can
 * run edge to edge.
 */
export function Screen({
  children,
  footer,
  onRefresh,
  refreshing = false,
  scrollRef,
}: {
  children: ReactNode;
  footer?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: footer ? 0 : insets.bottom + 56 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink3} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

/** Content inside the 24 side gutters. */
export function Gutter({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ paddingHorizontal: GUTTER }, style]}>{children}</View>;
}

export function Hairline({ color = "line", weight = 1 }: { color?: ColorName; weight?: number }) {
  const colors = useColors();
  return <View style={{ height: weight, backgroundColor: colors[color] }} />;
}

/** The row at the top of every screen: a back link or mark on the left, meta on the right. */
export function TopBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 10,
        paddingBottom: 14,
        paddingHorizontal: GUTTER,
      }}
    >
      <View>{left}</View>
      <View>{right}</View>
    </View>
  );
}

/**
 * "← Home": goes back, or to `fallback` when the screen was opened directly. `flush` drops the
 * 6/4 tap padding, as on the plan and cookbook artboards, and uses a hit slop in its place.
 */
export function BackLink({
  label,
  fallback = "/",
  flush = false,
}: {
  label: string;
  fallback?: "/" | "/plan" | "/cookbook" | "/people";
  flush?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Back to ${label}`}
      hitSlop={12}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
      style={flush ? undefined : { paddingTop: 6, paddingBottom: 4 }}
    >
      <Text variant="label" color="ink2">
        ← {label}
      </Text>
    </Pressable>
  );
}

/** The 12×12 accent square and a label. Only cook mode uses it. */
export function BrandMark({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 12, height: 12, backgroundColor: colors.accent }} />
      <Text variant="label" color="ink2">
        {label}
      </Text>
    </View>
  );
}

/** A page title with an optional line under it. `compact` is the tighter head used on the plan and cookbook. */
export function PageHead({
  title,
  lede,
  compact = false,
  style,
  children,
}: {
  title: string;
  lede?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return (
    <Gutter
      style={[
        compact
          ? { paddingTop: 22, paddingBottom: 24, gap: 8 }
          : { paddingTop: 24, paddingBottom: 28, gap: 12 },
        style,
      ]}
    >
      <Text variant="pageTitle" accessibilityRole="header">
        {title}
      </Text>
      {!!lede && <Text variant={compact ? "subtitle" : "body"}>{lede}</Text>}
      {children}
    </Gutter>
  );
}

/** The accent button: a mono caps label on the left and an arrow on the right. */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  tall = false,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** 56 high, for the cook-mode footer. */
  tall?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          height: tall ? 56 : 52,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.accent,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Text variant="button">{label}</Text>
      <Text variant="arrow" color="bg">
        →
      </Text>
    </Pressable>
  );
}

/** The 56×56 outlined button with a single glyph: cook mode's back. */
export function SquareButton({
  glyph,
  label,
  onPress,
  disabled = false,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 56,
        height: 56,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text variant="arrow" color="ink2">
        {glyph}
      </Text>
    </Pressable>
  );
}

/** A mono caps text link with a dotted underline, such as "Clear ticks". */
export function TextAction({
  label,
  onPress,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={10}
      onPress={onPress}
      style={[{ alignSelf: "flex-start", opacity: disabled ? 0.45 : 1 }, style]}
    >
      <Text variant="label" color="ink2" style={underline("dotted", 4)}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * An outlined chip. `timer` is the taller caps variant; `tag` is the small one that sits after
 * an item name; `active` turns it accent (a finished timer).
 */
export function Chip({
  label,
  kind = "plain",
  active = false,
  onPress,
}: {
  label: string;
  kind?: "plain" | "timer" | "tag";
  active?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  const box: ViewStyle = {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: active ? colors.accent : colors.line,
    paddingVertical: kind === "timer" ? 3 : kind === "tag" ? 1 : 2,
    paddingHorizontal: kind === "tag" ? 6 : 8,
  };
  const text =
    kind === "tag" ? (
      <Text variant="tag">{label}</Text>
    ) : kind === "timer" ? (
      <Text variant="label" color={active ? "accent" : "ink2"}>
        {label}
      </Text>
    ) : (
      <Text variant="chip">{label}</Text>
    );
  if (!onPress) return <View style={box}>{text}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} style={box}>
      {text}
    </Pressable>
  );
}

/** An accent mono caps label above a group of rows. Groups after the first get a top hairline. */
export function GroupLabel({ label, first = false }: { label: string; first?: boolean }) {
  const colors = useColors();
  return (
    <View
      style={[
        { paddingBottom: 10 },
        first
          ? { paddingTop: 22 }
          : { paddingTop: 26, borderTopWidth: 1, borderTopColor: colors.line },
      ]}
    >
      <Text variant="label" color="accent">
        {label}
      </Text>
    </View>
  );
}

/** A mono heading on the left with a count or note on the right, sharing a baseline. */
export function SectionHeader({
  title,
  meta,
  right,
  ruled = false,
  gap = 0,
}: {
  title: string;
  meta?: string;
  /** Replaces `meta` with any node, such as a text action. */
  right?: ReactNode;
  /** A hairline under the header, 14 below the text. */
  ruled?: boolean;
  /** Space under the header when it isn't ruled. */
  gap?: number;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 16 },
        ruled
          ? { paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.line }
          : { paddingBottom: gap },
      ]}
    >
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {right ?? (!!meta && <Text variant="label">{meta}</Text>)}
    </View>
  );
}

/**
 * A list row: a top hairline by default, and a bottom one on the last row of a list. Start or end
 * it with `Lane`s so columns line up down the list. `highlight` draws the cook-mode tint behind it.
 */
export function Row({
  children,
  align = "flex-start",
  pad = 11,
  rule = true,
  last = false,
  highlight = false,
  gap,
  onPress,
  label,
  role = "button",
  checked,
}: {
  children: ReactNode;
  align?: "flex-start" | "baseline" | "center";
  /** Vertical padding. */
  pad?: number;
  /** Whether the row has a top hairline. */
  rule?: boolean;
  last?: boolean;
  highlight?: boolean;
  gap?: number;
  onPress?: () => void;
  /** Accessibility label when the row is pressable. */
  label?: string;
  role?: "button" | "checkbox" | "link";
  checked?: boolean;
}) {
  const colors = useColors();
  const style: ViewStyle = {
    flexDirection: "row",
    alignItems: align,
    paddingVertical: pad,
    gap,
    ...(rule ? { borderTopWidth: 1, borderTopColor: colors.line } : {}),
    ...(last ? { borderBottomWidth: 1, borderBottomColor: colors.line } : {}),
  };
  const content = (
    <>
      {highlight && (
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: -12,
            right: -12,
            backgroundColor: colors.accentTint,
            borderLeftWidth: 2,
            borderLeftColor: colors.accent,
          }}
        />
      )}
      {children}
    </>
  );
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={checked === undefined ? undefined : { checked }}
      onPress={onPress}
      style={style}
    >
      {content}
    </Pressable>
  );
}

/** A fixed-width slot in a row. Trailing lanes (kcal, checkbox, arrow) are right-aligned. */
export function Lane({
  size,
  children,
  style,
}: {
  size: keyof typeof lane;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const trailing = size === "kcal" || size === "checkbox" || size === "arrow";
  return (
    <View style={[{ width: lane[size], flexShrink: 0, alignItems: trailing ? "flex-end" : "flex-start" }, style]}>
      {children}
    </View>
  );
}

/** The flexible column between a row's lanes. */
export function Fill({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flex: 1 }, style]}>{children}</View>;
}

/** The trailing "→" in its 20 lane. */
export function ArrowLane({ small = false, lineHeight }: { small?: boolean; lineHeight?: number }) {
  return (
    <Lane size="arrow">
      <Text
        variant="arrow"
        style={small ? { fontSize: 16, lineHeight: 20 } : lineHeight ? { lineHeight } : undefined}
      >
        →
      </Text>
    </Lane>
  );
}

/** Equal columns 16 apart, each a mono caps label over a value: recipe meta and per-serving figures. */
export function MetaRow({
  items,
  large = false,
  style,
}: {
  items: { label: string; value: ReactNode }[];
  /** The 20/26 figures under "Per serving". */
  large?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: "row", gap: 16 }, style]}>
      {items.map((item) => (
        <View key={item.label} style={{ flex: 1, gap: large ? 4 : 6 }}>
          <Text variant="label">{item.label}</Text>
          {typeof item.value === "string" ? (
            <Text variant={large ? "dayName" : "meal"}>{item.value}</Text>
          ) : (
            item.value
          )}
        </View>
      ))}
    </View>
  );
}

/** One mono caps line for loading, empty and error states. An error gets a retry action. */
export function StateLine({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <Gutter style={{ paddingVertical: 24, flexDirection: "row", gap: 10, alignItems: "baseline" }}>
      <Text variant="label">{onRetry ? `${text} ·` : text}</Text>
      {onRetry && <TextAction label="Retry" onPress={onRetry} />}
    </Gutter>
  );
}

/** The loading or error line for a query, or nothing once it has data. */
export function QueryState({
  query,
}: {
  query: { isPending: boolean; error: unknown; data: unknown; refetch: () => unknown };
}) {
  if (query.data !== undefined) return null;
  if (query.isPending) return <StateLine text="Loading…" />;
  if (query.error) return <StateLine text="Couldn't reach the API" onRetry={() => void query.refetch()} />;
  return null;
}

/** A form's error, in the accent colour. Renders nothing without one. */
export function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Text variant="secondary" color="accent" accessibilityRole="alert" style={{ paddingTop: 12 }}>
      {error instanceof Error ? error.message : String(error)}
    </Text>
  );
}

/** A hairline-ruled form field: a mono caps label over a plain input, with no box. */
export function Field({
  label,
  suffix,
  style,
  ...props
}: TextInputProps & { label: string; suffix?: string; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return (
    <View style={[{ paddingTop: 14, borderBottomWidth: 1, borderBottomColor: colors.line }, style]}>
      <Text variant="label">{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.ink3}
          {...props}
          style={[inputStyle, { color: colors.ink, flex: 1 }]}
        />
        {!!suffix && <Text variant="quantity">{suffix}</Text>}
      </View>
    </View>
  );
}

/** A bare 17 sans input. `Field` and the cookbook search share it. */
export const inputStyle: TextStyle = {
  fontFamily: sans[400],
  fontSize: 17,
  lineHeight: 22,
  paddingVertical: 10,
  paddingHorizontal: 0,
  minWidth: 0,
  // The browser's focus ring would draw the box the design leaves out.
  ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as TextStyle) : {}),
};

/** Text shown for copying: a token or a command, in mono, selectable. */
export function Code({ children }: { children: string }) {
  const colors = useColors();
  return (
    <RNText
      selectable
      style={{ fontFamily: mono[400], fontSize: 13, lineHeight: 20, color: colors.ink2 }}
    >
      {children}
    </RNText>
  );
}

/** Asks before something destructive. The web has no Alert, so it uses the browser's confirm. */
export function confirmAction(title: string, message: string, action: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: action, style: "destructive", onPress: onConfirm },
  ]);
}
