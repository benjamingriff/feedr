import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClerkProvider, useAuth, useClerk } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { AppearanceProvider } from "../appearance";
import { Connect } from "../connect";
import { StoreProvider, useStore } from "../store";
import { fonts, useColors, useScheme } from "../theme";

const client = new QueryClient();
const clerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Hold the splash screen until the fonts and saved appearance are in, so text never shows in a
// fallback face and the screen never flashes the default palette.
void SplashScreen.preventAutoHideAsync();

/** Connect until there's a connection; then one stack with Home at its root and no native headers. */
function Gate() {
  const { ready, connection } = useStore();
  const colors = useColors();
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!connection) return <Connect />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="cook/[versionId]" options={{ presentation: "fullScreenModal" }} />
    </Stack>
  );
}

function ClerkStore() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  return (
    <StoreProvider clerk={{ loaded: isLoaded, signedIn: !!isSignedIn, getToken, signOut: () => signOut() }}>
      <Gate />
    </StoreProvider>
  );
}

/** Dark text on light palettes and light text on dark ones, whatever the system says. */
function StatusBarForScheme() {
  return <StatusBar style={useScheme() === "dark" ? "light" : "dark"} />;
}

export default function Layout() {
  const [loaded, error] = useFonts(fonts);
  const [appearanceReady, setAppearanceReady] = useState(false);
  const onAppearanceReady = useCallback(() => setAppearanceReady(true), []);
  useEffect(() => {
    if ((loaded || error) && appearanceReady) void SplashScreen.hideAsync();
  }, [loaded, error, appearanceReady]);
  return (
    <AppearanceProvider onReady={onAppearanceReady}>
      {(loaded || error) && <App />}
    </AppearanceProvider>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <StatusBarForScheme />
        {clerkKey ? (
          <ClerkProvider publishableKey={clerkKey} tokenCache={tokenCache} __experimental_disableNativeClientSync>
            <ClerkStore />
          </ClerkProvider>
        ) : (
          <StoreProvider>
            <Gate />
          </StoreProvider>
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
