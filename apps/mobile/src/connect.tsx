import { useState } from "react";
import { Platform } from "react-native";
import { useSSO } from "@clerk/expo";
import { ErrorLine, Field, Gutter, PageHead, PrimaryButton, Screen, Text, TextAction, TopBar } from "./primitives";
import { useStore } from "./store";

/** Runs an async action for a form, tracking whether it's busy and what went wrong. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

/**
 * Google sign-in through Clerk's browser flow (works in Expo Go), then a connection that
 * uses the Clerk session instead of a personal token. The first sign-in creates the feedr
 * account on the API.
 */
function GoogleSignIn({ url }: { url: string }) {
  const { startSSOFlow } = useSSO();
  const { clerk, connect } = useStore();
  const { busy, error, run } = useAction();
  // Signed in to Clerk already (e.g. the API was unreachable last time): just connect.
  if (clerk?.signedIn)
    return (
      <>
        <PrimaryButton
          label={busy ? "Connecting…" : "Connect"}
          disabled={busy || !url}
          style={{ marginTop: 28 }}
          onPress={() => void run(() => connect(url))}
        />
        <ErrorLine error={error} />
      </>
    );

  return (
    <>
      <PrimaryButton
        label={busy ? "Signing in…" : "Continue with Google"}
        disabled={busy || !url}
        style={{ marginTop: 28 }}
        onPress={() =>
          void run(async () => {
            const { createdSessionId, setActive, signUp } = await startSSOFlow({ strategy: "oauth_google" });
            if (createdSessionId && setActive) {
              await setActive({ session: createdSessionId });
              await connect(url);
            } else if (signUp?.status === "missing_requirements") {
              throw new Error(`Clerk needs more details to finish sign-up: ${signUp.missingFields.join(", ")}.`);
            }
            // Otherwise the browser was closed: nothing to do.
          })
        }
      />
      <ErrorLine error={error} />
    </>
  );
}

/** The first screen: where the API is and how to sign in to it. */
export function Connect() {
  const { connect, clerk, error: storedError } = useStore();
  // scripts/setup.sh writes EXPO_PUBLIC_API_URL, so most people never type the URL.
  const [url, setUrl] = useState(
    process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === "web" ? "http://localhost:4100" : ""),
  );
  const [token, setToken] = useState("");
  // Lead with Google when Clerk is configured; the personal token is the fallback.
  const [withToken, setWithToken] = useState(!clerk);
  const { busy, error, run } = useAction();
  return (
    <Screen>
      <TopBar />
      <PageHead title="Connect" lede="Sign in to your feedr API." />
      <Gutter>
        <Field
          label="API URL"
          placeholder="http://192.168.1.10:4100"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={{ paddingTop: 0 }}
        />
        {withToken ? (
          <>
            <Field
              label="Personal token"
              placeholder="feedr_…"
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <ErrorLine error={error ?? storedError} />
            <PrimaryButton
              label={busy ? "Connecting…" : "Connect"}
              disabled={busy || !url || !token.trim()}
              style={{ marginTop: 28 }}
              onPress={() => void run(() => connect(url, token))}
            />
          </>
        ) : (
          <>
            <GoogleSignIn url={url} />
            <ErrorLine error={storedError} />
            <Text variant="secondary" style={{ paddingTop: 16 }}>
              Your first sign-in creates your feedr account.
            </Text>
          </>
        )}
        {clerk && (
          <TextAction
            label={withToken ? "Sign in with Google →" : "Use a personal token →"}
            style={{ marginTop: 20 }}
            onPress={() => setWithToken(!withToken)}
          />
        )}
      </Gutter>
    </Screen>
  );
}
