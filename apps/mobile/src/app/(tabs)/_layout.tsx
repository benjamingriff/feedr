import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../ui";
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        headerTintColor: colors.accent,
      }}
    >
      {[
        ["index", "Plan", "◷"],
        ["recipes", "Recipes", "≡"],
        ["shopping", "Shopping", "✓"],
        ["people", "People", "○"],
      ].map(([name, title, icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarAccessibilityLabel: title,
            tabBarIcon: ({ color }) => (
              <Text
                aria-hidden
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={{ color, fontSize: 24 }}
              >
                {icon}
              </Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
