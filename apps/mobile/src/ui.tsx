import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const colors = {
  accent: "#236b50",
  text: "#202522",
  muted: "#626b65",
  bg: "#f4f5f4",
  border: "#d9dfdb",
  error: "#a12121",
};
export function T({
  children,
  muted = false,
  title = false,
}: {
  children: ReactNode;
  muted?: boolean;
  title?: boolean;
}) {
  return (
    <Text
      style={{
        color: muted ? colors.muted : colors.text,
        fontSize: title ? 21 : 16,
        fontWeight: title ? "600" : "400",
        lineHeight: title ? 28 : 23,
      }}
    >
      {children}
    </Text>
  );
}
export function Screen({
  children,
  refresh,
  refreshing = false,
  top = false,
}: {
  children: ReactNode;
  refresh?: () => void;
  refreshing?: boolean;
  top?: boolean;
}) {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={
        top ? ["top", "left", "right", "bottom"] : ["left", "right", "bottom"]
      }
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.screen}
        refreshControl={
          refresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function Card({
  children,
  onPress,
  label,
}: {
  children: ReactNode;
  onPress?: () => void;
  label?: string;
}) {
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={s.card}
    >
      {children}
    </Pressable>
  ) : (
    <View style={s.card}>{children}</View>
  );
}
export function Row({ children }: { children: ReactNode }) {
  return <View style={s.row}>{children}</View>;
}
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[
        s.button,
        {
          backgroundColor: secondary ? "#e8eeea" : colors.accent,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: secondary ? colors.accent : "white",
          fontSize: 15,
          fontWeight: "600",
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 5 }}>
      <T>{label}</T>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={s.input}
        {...props}
      />
    </View>
  );
}
export function ErrorMessage({ error }: { error: unknown }) {
  return error ? (
    <Text
      accessibilityRole="alert"
      style={{ color: colors.error, lineHeight: 22 }}
    >
      {error instanceof Error ? error.message : String(error)}
    </Text>
  ) : null;
}
export function Loading() {
  return (
    <ActivityIndicator
      accessibilityLabel="Loading"
      color={colors.accent}
      style={{ margin: 24 }}
    />
  );
}
export function QueryState({
  pending,
  error,
  retry,
}: {
  pending: boolean;
  error: unknown;
  retry: () => void;
}) {
  return pending ? (
    <Loading />
  ) : error ? (
    <Card>
      <ErrorMessage error={error} />
      <Button title="Try again" onPress={retry} />
    </Card>
  ) : null;
}
export function Bar({
  label,
  value,
  target,
  unit = "",
}: {
  label: string;
  value: number | null;
  target: number | null;
  unit?: string;
}) {
  return (
    <View style={{ gap: 5 }}>
      <T muted>
        {label}: {num(value)}
        {unit}
        {target == null ? " · no target" : ` / ${num(target)}${unit}`}
      </T>
      <View style={{ height: 7, backgroundColor: "#e1e5e2", borderRadius: 4 }}>
        <View
          style={{
            height: 7,
            backgroundColor: colors.accent,
            borderRadius: 4,
            width: `${target && value != null ? Math.min(100, Math.max(0, (value / target) * 100)) : 0}%`,
          }}
        />
      </View>
    </View>
  );
}
export function confirmRemoval(action: () => void) {
  if (Platform.OS === "web") {
    if (
      window.confirm(
        "Remove this portion? The service is deleted when its last portion is removed.",
      )
    )
      action();
  } else
    Alert.alert(
      "Remove portion?",
      "The service is deleted when its last portion is removed.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: action },
      ],
    );
}
export const num = (n: number | null | undefined) =>
  n == null ? "—" : String(Math.round(n * 10) / 10);
export const pct = (n: number) => `${num(n * 100)}%`;
export const s = StyleSheet.create({
  screen: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  card: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 16,
    gap: 12,
  },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 7,
    alignItems: "center",
    minHeight: 44,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "white",
    borderRadius: 7,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    minHeight: 46,
  },
});
