import { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClerkProvider, useAuth, useClerk } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Connect } from "../connect";
import { StoreProvider, useStore } from "../store";
import { fonts, useColors } from "../theme";

const client = new QueryClient();
const clerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Hold the splash screen until the fonts are in, so text never shows in a fallback face.
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

export default function Layout() {
  const [loaded, error] = useFonts(fonts);
  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <StatusBar style="auto" />
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
