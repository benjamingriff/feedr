import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Me } from "@feedr/core";

type Connection = {
  url: string;
  token?: string;
  auth: "token" | "clerk";
  userId: string;
};
export type ClerkSession = {
  loaded: boolean;
  signedIn: boolean;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
};
const key = "feedr.connection.v1";
const storage = {
  get: () =>
    Platform.OS === "web"
      ? AsyncStorage.getItem(key)
      : SecureStore.getItemAsync(key),
  set: (value: string) =>
    Platform.OS === "web"
      ? AsyncStorage.setItem(key, value)
      : SecureStore.setItemAsync(key, value),
  clear: () =>
    Platform.OS === "web"
      ? AsyncStorage.removeItem(key)
      : SecureStore.deleteItemAsync(key),
};
export function apiUrl(value: string) {
  const url = value.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Enter a valid http:// or https:// API URL.");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error("Use a plain http:// or https:// API URL.");
  return url;
}
async function request<T>(
  url: string,
  token: string,
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    let response: Response;
    try {
      response = await fetch(url + path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new Error(
        `Could not reach ${url}. Check the API address and network. On iPhone use your computer’s LAN address, not localhost.`,
      );
    }
    const data: unknown =
      response.status === 204 ? undefined : await response.json();
    if (!response.ok)
      throw new Error(
        typeof data === "object" && data && "error" in data
          ? String(data.error)
          : `Request failed (${response.status})`,
      );
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}
type Store = {
  connection: Connection | null;
  ready: boolean;
  error: string;
  clerk?: ClerkSession;
  connect: (url: string, token?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  api: <T>(path: string, body?: unknown, method?: string) => Promise<T>;
};
const Context = createContext<Store | null>(null);
export function StoreProvider({
  children,
  clerk,
}: {
  children: ReactNode;
  clerk?: ClerkSession;
}) {
  const client = useQueryClient();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    storage
      .get()
      .then((raw) => {
        if (raw) setConnection(JSON.parse(raw) as Connection);
      })
      .catch(() =>
        setError("Could not read saved connection. Please reconnect."),
      )
      .finally(() => setReady(true));
  }, []);
  async function connect(input: string, personalToken?: string) {
    const url = apiUrl(input);
    const auth = personalToken !== undefined ? "token" : "clerk";
    const token = personalToken?.trim() ?? (await clerk?.getToken());
    if (!token)
      throw new Error("Enter a personal token or sign in with Apple or Google.");
    const me = await request<Me>(url, token, "/me");
    const c: Connection = {
      url,
      auth,
      userId: me.id,
      ...(auth === "token" ? { token } : {}),
    };
    await storage.set(JSON.stringify(c));
    client.clear();
    setConnection(c);
    setError("");
  }
  async function disconnect() {
    await storage.clear();
    setConnection(null);
    client.clear();
    if (clerk?.signedIn) await clerk.signOut();
  }
  async function api<T>(path: string, body?: unknown, method?: string) {
    if (!connection) throw new Error("Connect to your API first.");
    const token =
      connection.auth === "clerk" ? await clerk?.getToken() : connection.token;
    if (!token)
      throw new Error(
        "Your session has expired. Disconnect in People and sign in again.",
      );
    return request<T>(connection.url, token, path, body, method);
  }
  return (
    <Context.Provider
      value={{
        connection,
        ready: ready && (!clerk || clerk.loaded),
        error,
        clerk,
        connect,
        disconnect,
        api,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const value = useContext(Context);
  if (!value) throw new Error("Store missing");
  return value;
}
/**
 * A GET against the connected API, cached per connection. `enabled: false` holds the request
 * until its inputs are known; `keepPrevious` shows the last result while a new key loads.
 */
export function useApiQuery<T>(
  key: readonly unknown[],
  path: string,
  options: { enabled?: boolean; keepPrevious?: boolean } = {},
) {
  const { api, connection } = useStore();
  return useQuery({
    queryKey: [connection?.url, connection?.userId, ...key],
    queryFn: () => api<T>(path),
    enabled: !!connection && (options.enabled ?? true),
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
    retry: 1,
  });
}
