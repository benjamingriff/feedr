import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider, useAuth, useClerk } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { StoreProvider, useStore } from "../store";
import { Connect } from "../connect";
import { Loading, colors } from "../ui";
const client = new QueryClient();
const clerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
function Gate() {
  const { ready, connection } = useStore();
  if (!ready) return <Loading />;
  if (!connection) return <Connect />;
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.accent,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="recipe/[id]" options={{ title: "Recipe" }} />
      <Stack.Screen name="service/[id]" options={{ title: "Dish up" }} />
      <Stack.Screen name="cook/[versionId]" options={{ title: "Cook mode" }} />
    </Stack>
  );
}
function ClerkStore() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  return (
    <StoreProvider
      clerk={{
        loaded: isLoaded,
        signedIn: !!isSignedIn,
        getToken,
        signOut: () => signOut(),
      }}
    >
      <Gate />
    </StoreProvider>
  );
}
export default function Layout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <StatusBar style="dark" />
        {clerkKey ? (
          <ClerkProvider
            publishableKey={clerkKey}
            tokenCache={tokenCache}
            __experimental_disableNativeClientSync
          >
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
