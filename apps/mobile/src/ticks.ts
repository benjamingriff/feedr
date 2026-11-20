import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_URL, useStore } from './store';

/**
 * Shopping ticks for one week: ingredient ids kept on the device, per API and account. They go
 * through the query cache so Home's count follows the shopping list.
 */
export function useTicks(weekStart: string) {
  const { connection } = useStore();
  const client = useQueryClient();
  const storageKey = `feedr.ticks:${API_URL}:${connection?.userId}:${weekStart}`;
  const queryKey = ['ticks', storageKey];
  const query = useQuery({
    queryKey,
    queryFn: async () => JSON.parse((await AsyncStorage.getItem(storageKey)) ?? '[]') as string[],
    staleTime: Infinity,
  });
  return {
    ticked: query.data ?? [],
    /** False until the saved ticks have been read, so a tap can't overwrite them. */
    ready: query.data !== undefined,
    set(ids: string[]) {
      client.setQueryData(queryKey, ids);
      void AsyncStorage.setItem(storageKey, JSON.stringify(ids));
    },
  };
}
