import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { useUser } from "@clerk/expo";
import * as Clipboard from "expo-clipboard";
import type { Me } from "@feedr/core";
import { Monogram, SettingRow } from "../../account-parts";
import { PaletteSwatch } from "../../appearance";
import {
  BackLink,
  Code,
  ErrorLine,
  Fill,
  Gutter,
  Lane,
  PrimaryButton,
  QueryState,
  Row,
  Screen,
  SectionHeader,
  Text,
  TextAction,
  Toggle,
  TopBar,
} from "../../primitives";
import { API_URL, useApiQuery, useStore } from "../../store";
import { useAppearance } from "../../theme";

// Design mock: the household, cooking and reminder settings hold local state only, and export
// does nothing yet. The profile, appearance, agent access and sign-out are live.

/** Creates a token for an agent and shows it once, with the command that connects Claude to the MCP server. */
function AgentAccess() {
  const { api } = useStore();
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState<"token" | "command" | null>(null);
  const create = useMutation({
    mutationFn: () => api<{ token: string }>("/me/tokens", { name: "Agent token" }),
    onSuccess: (result) => setToken(result.token),
  });
  const command = `claude mcp add --transport http feedr ${API_URL}/mcp --header "Authorization: Bearer ${token}"`;
  const copy = (what: "token" | "command") =>
    void Clipboard.setStringAsync(what === "token" ? token : command).then(() => setCopied(what));

  return (
    <Section title="Agent access" meta="MCP">
      <Text variant="note" style={{ paddingVertical: 14 }}>
        {token
          ? "Save this token now. It's shown once and can't be read again."
          : "A token lets an agent add recipes and plan meals for you."}
      </Text>
      {!token && (
        <PrimaryButton label={create.isPending ? "Creating…" : "Create token"} disabled={create.isPending} onPress={() => create.mutate()} />
      )}
      <ErrorLine error={create.error} />
      {!!token && (
        <View style={{ gap: 20 }}>
          <View style={{ gap: 8 }}>
            <Text variant="label">Token</Text>
            <Code>{token}</Code>
            <TextAction label={copied === "token" ? "Copied" : "Copy token"} onPress={() => copy("token")} />
          </View>
          <View style={{ gap: 8 }}>
            <Text variant="label">Connect Claude</Text>
            <Code>{command}</Code>
            <TextAction label={copied === "command" ? "Copied" : "Copy command"} onPress={() => copy("command")} />
          </View>
        </View>
      )}
    </Section>
  );
}

/** A ruled section 44 below the last one. */
function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <Gutter style={{ paddingTop: 44 }}>
      <SectionHeader ruled title={title} meta={meta} />
      {children}
    </Gutter>
  );
}

/** Who's in your home (just you, until households exist), and the way to invite someone. */
function Household({ name }: { name: string }) {
  const members = [{ name, role: "You · owner" }];
  return (
    <Gutter style={{ paddingTop: 8 }}>
      <SectionHeader ruled title="Your home" meta={members.length === 1 ? "1 person" : `${members.length} people`} />
      {members.map((member, i) => (
        <Row key={member.name} pad={14} align="center" rule={i > 0} last={i === members.length - 1}>
          <Lane size="number">
            <Text variant="stepNumber" style={{ lineHeight: 22 }}>
              {String(i + 1).padStart(2, "0")}
            </Text>
          </Lane>
          <Fill style={{ gap: 1 }}>
            <Text variant="itemName">{member.name}</Text>
            <Text variant="secondary">{member.role}</Text>
          </Fill>
        </Row>
      ))}
      <Text variant="note" style={{ paddingTop: 16, paddingBottom: 18 }}>
        Share one cookbook, meal plan and shopping list with someone you live with. You’ll both show up in People.
      </Text>
      <PrimaryButton label="Invite to your home" onPress={() => router.push("/account/invite")} />
      <TextAction label="Got an invite? Join a home" style={{ marginTop: 18 }} onPress={() => {}} />
    </Gutter>
  );
}

const modeLabel = { system: "Follows your phone", light: "Light", dark: "Dark" } as const;
const providerLabel: Partial<Record<string, string>> = { apple: "Apple", google: "Google" };

/** Your profile and home, the app's settings, agent access, and signing out or deleting the account. */
export default function Account() {
  const { disconnect } = useStore();
  const { user } = useUser();
  const { palette, mode } = useAppearance();
  const me = useApiQuery<Me>(["me"], "/me");
  const [copied, setCopied] = useState(false);
  const [awake, setAwake] = useState(true);
  const [alarm, setAlarm] = useState(true);
  const [planReminder, setPlanReminder] = useState(true);
  const [shopReminder, setShopReminder] = useState(false);

  const name = me.data?.name ?? "";
  const email = user?.primaryEmailAddress?.emailAddress;
  const provider = providerLabel[user?.externalAccounts[0]?.provider ?? ""];

  return (
    <Screen refreshing={me.isRefetching} onRefresh={() => void me.refetch()}>
      <TopBar left={<BackLink label="Home" />} right={<Text variant="label">Account</Text>} />
      <QueryState query={me} />
      {me.data && (
        <>
          <Gutter style={{ paddingTop: 24, paddingBottom: 36, gap: 20 }}>
            <Monogram name={name} size={64} filled />
            <View style={{ gap: 8 }}>
              <Text variant="pageTitle" accessibilityRole="header">
                {name}
              </Text>
              {!!email && <Text variant="body">{email}</Text>}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text variant="label">ID {me.data.id.slice(0, 8).toUpperCase()}</Text>
              <TextAction
                label={copied ? "Copied" : "Copy ID"}
                onPress={() => void Clipboard.setStringAsync(me.data.id).then(() => setCopied(true))}
              />
            </View>
          </Gutter>
          <Household name={name} />
        </>
      )}

      <Section title="Appearance">
        <SettingRow
          rule={false}
          title="Colour and mode"
          detail={`${palette} · ${modeLabel[mode]}`}
          control={<PaletteSwatch palette={palette} />}
          onPress={() => router.push("/appearance")}
          last
        />
      </Section>

      <Section title="Cooking">
        <SettingRow rule={false} title="Keep screen on" detail="While cook mode is open" control={<Toggle label="Keep screen on" value={awake} onChange={setAwake} />} />
        <SettingRow title="Units" value="Metric" onPress={() => {}} />
        <SettingRow title="Week starts on" value="Monday" onPress={() => {}} />
        <SettingRow title="Default servings" value="2" onPress={() => {}} last />
      </Section>

      <Section title="Timers & reminders" meta="Coming soon">
        <SettingRow rule={false} title="Timer alarm" detail="Sound and vibrate when a step's timer ends" control={<Toggle label="Timer alarm" value={alarm} onChange={setAlarm} />} />
        <SettingRow title="Plan the week" detail="Sundays at 18:00" control={<Toggle label="Plan the week" value={planReminder} onChange={setPlanReminder} />} />
        <SettingRow title="Shopping list" detail="The morning of your shop" control={<Toggle label="Shopping list" value={shopReminder} onChange={setShopReminder} />} last />
      </Section>

      <AgentAccess />

      <Section title="Sign-in & data" meta={provider ? `Signed in with ${provider}` : "Signed in"}>
        <SettingRow rule={false} title="Export my data" detail="Recipes, plans and people as JSON" onPress={() => {}} />
        <SettingRow title="Sign out" onPress={() => void disconnect()} />
        <SettingRow
          title="Delete account"
          detail="Removes your account and everything in it"
          tone="accent"
          onPress={() => router.push("/account/delete")}
          last
        />
      </Section>
    </Screen>
  );
}
