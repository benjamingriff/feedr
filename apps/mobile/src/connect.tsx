import { useState } from "react";
import { Platform } from "react-native";
import { useSignIn } from "@clerk/expo";
import { useStore } from "./store";
import { Button, Card, ErrorMessage, Field, Screen, T } from "./ui";
function EmailSignIn({ url }: { url: string }) {
  const { signIn, fetchStatus } = useSignIn();
  const { clerk, connect } = useStore();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <T title>Or sign in with email</T>
      {clerk?.signedIn ? (
        <Button
          title="Connect signed-in account"
          disabled={busy || !url}
          onPress={() => {
            void run(() => connect(url));
          }}
        />
      ) : (
        <>
          <Field
            label="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            title={sent ? "Resend code" : "Send email code"}
            disabled={busy || fetchStatus === "fetching" || !email || !url}
            onPress={() => {
              void run(async () => {
                const result = await signIn.emailCode.sendCode({
                  emailAddress: email.trim(),
                });
                if (result.error) throw new Error(result.error.message);
                setSent(true);
              });
            }}
          />
          {sent && (
            <>
              <Field
                label="Email code"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoComplete="one-time-code"
              />
              <Button
                title="Verify and sign in"
                disabled={busy || !code || fetchStatus === "fetching"}
                onPress={() => {
                  void run(async () => {
                    const result = await signIn.emailCode.verifyCode({
                      code: code.trim(),
                    });
                    if (result.error) throw new Error(result.error.message);
                    if (signIn.status !== "complete")
                      throw new Error(
                        "This account needs another sign-in step. Use a personal token for this prototype.",
                      );
                    const finished = await signIn.finalize();
                    if (finished.error) throw new Error(finished.error.message);
                  });
                }}
              />
            </>
          )}
        </>
      )}
      <ErrorMessage error={error} />
    </Card>
  );
}
export function Connect() {
  const { connect, clerk, error: storedError } = useStore();
  const [url, setUrl] = useState(
    Platform.OS === "web" ? "http://localhost:4100" : "",
  );
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Screen top>
      <T title>feedr</T>
      <T>Your recipes, meals and shopping.</T>
      <Card>
        <T title>Connect to your API</T>
        <Field
          label="API URL"
          placeholder="http://192.168.1.10:4100"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <T muted>On iPhone, use your server’s LAN address.</T>
        <Field
          label="Personal token"
          placeholder="feedr_…"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <ErrorMessage error={error || storedError} />
        <Button
          title={busy ? "Connecting…" : "Connect"}
          disabled={busy || !url || !token.trim()}
          onPress={() => {
            setBusy(true);
            setError("");
            void connect(url, token)
              .catch((e) =>
                setError(e instanceof Error ? e.message : String(e)),
              )
              .finally(() => setBusy(false));
          }}
        />
        <T muted>
          {Platform.OS === "web"
            ? "Your connection is saved in this browser’s local storage."
            : "Your connection is saved in this device’s secure storage."}
        </T>
      </Card>
      {clerk && <EmailSignIn url={url} />}
    </Screen>
  );
}
