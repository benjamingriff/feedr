import { useState } from "react";
import { AccessibilityInfo, Image, Pressable, Text as RNText, View } from "react-native";
import { useSSO } from "@clerk/expo";
import { ErrorLine, Gutter, PageHead, PrimaryButton, Screen, StateLine, Text, TopBar } from "./primitives";
import { API_URL, useStore } from "./store";
import { sans } from "./theme";

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

const brands = {
  apple: { strategy: "oauth_apple", title: "Continue with Apple", name: "Apple" },
  google: { strategy: "oauth_google", title: "Continue with Google", name: "Google" },
} as const;
type Brand = keyof typeof brands;

/**
 * A "Continue with Apple" or "Continue with Google" button, drawn to each company's rules for
 * custom buttons. Apple sits next to Google to meet the App Store's login rule (guideline 4.8),
 * and both companies ask that neither button be smaller or lighter than the other, so the two
 * share one shape: 44 high, full width, square corners, white with a 1px #747775 stroke inside,
 * and logos on the same axis so both titles start 48 in. Colours and fonts are the brands', not
 * theme tokens, so the buttons look the same in light and dark. Titles ignore the system text
 * size so they keep Apple's and Google's proportions to the fixed 44 height.
 *
 * - Apple: Apple's left-aligned Medium logo file at the button's full height, and the title at
 *   43% of the height (19), black. The PNGs are Apple's, sized for 44pt buttons.
 * - Google: the standard G at 20×20, 16 from the edge and 12 from the title, in Google Sans
 *   Medium 14/20 #1F1F1F. The PNGs are Google's iOS G, rendered without the button around it.
 */
function BrandButton({ brand, onPress, disabled }: { brand: Brand; onPress: () => void; disabled: boolean }) {
  const { title } = brands[brand];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={{ height: 44, flexDirection: "row", alignItems: "center", backgroundColor: "#ffffff" }}
    >
      {brand === "apple" ? (
        <>
          <Image
            source={require("../assets/sign-in/apple-logo.png")}
            style={{ width: 31, height: 44, marginLeft: 10, marginRight: 7 }}
          />
          <RNText allowFontScaling={false} style={{ fontFamily: sans[500], fontSize: 19, color: "#000000" }}>
            {title}
          </RNText>
        </>
      ) : (
        <>
          <Image
            source={require("../assets/sign-in/google-g.png")}
            style={{ width: 20, height: 20, marginLeft: 16, marginRight: 12 }}
          />
          <RNText
            allowFontScaling={false}
            style={{ fontFamily: "GoogleSans_500Medium", fontSize: 14, lineHeight: 20, color: "#1f1f1f" }}
          >
            {title}
          </RNText>
        </>
      )}
      {/* The stroke sits on top, inside the edge, so Apple's logo file can fill the full height. */}
      <View
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          borderWidth: 1,
          borderColor: "#747775",
          pointerEvents: "none",
        }}
      />
    </Pressable>
  );
}

/**
 * Apple or Google sign-in through Clerk's browser flow (works in Expo Go), then the feedr account
 * for that session. The first sign-in creates the account on the API.
 */
function SocialSignIn() {
  const { startSSOFlow } = useSSO();
  const { clerk, connect, disconnect } = useStore();
  const { busy, error, run } = useAction();
  const [brand, setBrand] = useState<Brand>("apple");
  // Signed in to Clerk already (e.g. feedr was unreachable last time): just finish.
  if (clerk?.signedIn)
    return (
      <>
        <PrimaryButton label={busy ? "Signing in…" : "Continue"} disabled={busy} onPress={() => void run(connect)} />
        <ErrorLine error={error} />
      </>
    );

  function signIn(next: Brand) {
    setBrand(next);
    // The buttons only dim, so tell screen reader users the press started something.
    AccessibilityInfo.announceForAccessibility(`Signing in with ${brands[next].name}`);
    void run(async () => {
      // Signed out, so any saved account is from a session that ended outside Sign out (it
      // expired, say). Forget it, so this sign-in can't reopen it before /me answers.
      await disconnect();
      const { createdSessionId, setActive, signUp } = await startSSOFlow({ strategy: brands[next].strategy });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        await connect();
      } else if (signUp?.status === "missing_requirements") {
        throw new Error(`We need a few more details to finish sign-up: ${signUp.missingFields.join(", ")}.`);
      }
      // Otherwise the browser was closed: nothing to do.
    });
  }

  // The brands' titles can't change, so progress shows on a line underneath instead.
  return (
    <>
      <View style={{ gap: 12 }}>
        <BrandButton brand="apple" disabled={busy} onPress={() => signIn("apple")} />
        <BrandButton brand="google" disabled={busy} onPress={() => signIn("google")} />
      </View>
      {busy && (
        <Text variant="label" style={{ paddingTop: 16 }}>
          Signing in with {brands[brand].name}…
        </Text>
      )}
      <ErrorLine error={error} />
    </>
  );
}

/**
 * The first screen. The API address and Clerk key come from the build's environment, so
 * there is nothing to type here. A build missing either can't sign anyone in, and says so.
 */
export function Connect() {
  const { clerk, error } = useStore();
  return (
    <Screen>
      <TopBar />
      <PageHead title="Sign in" lede="Your meal plan, cookbook and shopping list, kept up to date by your agent." />
      {clerk && API_URL ? (
        <Gutter>
          <SocialSignIn />
          <ErrorLine error={error} />
          <Text variant="secondary" style={{ paddingTop: 16 }}>
            Your first sign-in creates your feedr account.
          </Text>
        </Gutter>
      ) : (
        <StateLine text="Sign-in isn’t available right now" />
      )}
    </Screen>
  );
}
