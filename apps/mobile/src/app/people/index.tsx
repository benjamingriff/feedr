import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import type { Person } from "@feedr/core";
import { num } from "../../format";
import {
  ArrowLane,
  BackLink,
  Code,
  ErrorLine,
  Fill,
  Gutter,
  PageHead,
  PrimaryButton,
  QueryState,
  Row,
  Screen,
  SectionHeader,
  Text,
  TextAction,
  TopBar,
} from "../../primitives";
import { useApiQuery, useStore } from "../../store";

/** Creates a token for an agent and shows it once, with the command that connects Claude to the MCP server. */
function AgentAccess() {
  const { api, connection } = useStore();
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState<"token" | "command" | null>(null);
  const create = useMutation({
    mutationFn: () => api<{ token: string }>("/me/tokens", { name: "Agent token" }),
    onSuccess: (result) => setToken(result.token),
  });
  const command = `claude mcp add --transport http feedr ${connection?.url}/mcp --header "Authorization: Bearer ${token}"`;
  const copy = (what: "token" | "command") =>
    void Clipboard.setStringAsync(what === "token" ? token : command).then(() => setCopied(what));

  return (
    <Gutter style={{ paddingTop: 44 }}>
      <SectionHeader ruled title="Agent access" meta="MCP" />
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
    </Gutter>
  );
}

/** Who you cook for, plus agent tokens and the API connection. */
export default function People() {
  const { connection, disconnect } = useStore();
  const query = useApiQuery<Person[]>(["people"], "/people");
  const people = query.data ?? [];
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <TopBar left={<BackLink label="Home" />} />
      <PageHead title="People" lede="Who you cook for." />
      <QueryState query={query} />
      <Gutter>
        {people.map((person, i) => (
          <Row
            key={person.id}
            last={i === people.length - 1}
            label={`Edit ${person.name}`}
            onPress={() => router.push({ pathname: "/people/[id]", params: { id: person.id } })}
          >
            <Fill style={{ gap: 1 }}>
              <Text variant="itemName">{person.name}</Text>
              <Text variant="secondary">
                {[
                  `${num(person.daily_kcal)} kcal`,
                  person.daily_protein_g != null && `${num(person.daily_protein_g)} g protein`,
                ]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                a day
              </Text>
            </Fill>
            <ArrowLane />
          </Row>
        ))}
        {query.data && (
          <TextAction
            label="+ Add person"
            style={{ marginTop: 18 }}
            onPress={() => router.push({ pathname: "/people/[id]", params: { id: "new" } })}
          />
        )}
      </Gutter>
      <AgentAccess />
      <Gutter style={{ paddingTop: 44 }}>
        <SectionHeader ruled title="Connection" meta={connection?.auth === "clerk" ? "Signed in" : "Personal token"} />
        <View style={{ paddingVertical: 14 }}>
          <Code>{connection?.url ?? ""}</Code>
        </View>
        <TextAction label={connection?.auth === "clerk" ? "Sign out" : "Disconnect"} onPress={() => void disconnect()} />
      </Gutter>
    </Screen>
  );
}
