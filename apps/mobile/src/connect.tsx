import { useState } from "react";
import { Platform, View } from "react-native";
import { useSignIn } from "@clerk/expo";
import { ErrorLine, Field, Gutter, PageHead, PrimaryButton, Screen, SectionHeader, TextAction, TopBar } from "./primitives";
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

/** Email-code sign-in with Clerk, then a connection that uses the Clerk session instead of a token. */
function EmailSignIn({ url }: { url: string }) {
  const { signIn, fetchStatus } = useSignIn();
  const { clerk, connect } = useStore();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  const waiting = busy || fetchStatus === "fetching";

  if (clerk?.signedIn)
    return (
      <>
        <PrimaryButton label="Connect" disabled={busy || !url} onPress={() => void run(() => connect(url))} />
        <ErrorLine error={error} />
      </>
    );
  return (
    <>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        style={{ paddingTop: 0 }}
      />
      {sent && (
        <Field label="Email code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" />
      )}
      <ErrorLine error={error} />
      <PrimaryButton
        label={sent ? "Verify and connect" : "Send code"}
        disabled={waiting || !url || (sent ? !code : !email)}
        style={{ marginTop: 28 }}
        onPress={() =>
          void run(async () => {
            if (!sent) {
              const result = await signIn.emailCode.sendCode({ emailAddress: email.trim() });
              if (result.error) throw new Error(result.error.message);
              return setSent(true);
            }
            const result = await signIn.emailCode.verifyCode({ code: code.trim() });
            if (result.error) throw new Error(result.error.message);
            if (signIn.status !== "complete") throw new Error("This account needs another sign-in step. Use a personal token.");
            const finished = await signIn.finalize();
            if (finished.error) throw new Error(finished.error.message);
          })
        }
      />
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
  // Lead with email sign-in when Clerk is configured; the personal token is the fallback.
  const [withEmail, setWithEmail] = useState(!!clerk);
  const { busy, error, run } = useAction();
  return (
    <Screen>
      <TopBar />
      <PageHead title="Connect" lede="Point feedr at your API." />
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
        {withEmail ? (
          <View style={{ paddingTop: 36 }}>
            <SectionHeader title="Sign in with email" gap={14} />
            <EmailSignIn url={url} />
          </View>
        ) : (
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
        )}
        {clerk && (
          <TextAction
            label={withEmail ? "Use a personal token →" : "Sign in with email →"}
            style={{ marginTop: 20 }}
            onPress={() => setWithEmail(!withEmail)}
          />
        )}
      </Gutter>
    </Screen>
  );
}
