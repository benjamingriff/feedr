import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { ShoppingItem, ShoppingList } from '@feedr/core';
import { addDays, monday, today, weekRange } from '../dates';
import { amount, capitalise } from '../format';
import {
  BackLink,
  GroupLabel,
  Gutter,
  Lane,
  PageHead,
  QueryState,
  Screen,
  SectionHeader,
  StateLine,
  Text,
  TextAction,
  TopBar,
} from '../primitives';
import { IngredientRow } from '../recipe-parts';
import { useApiQuery } from '../store';
import { sans, useColors } from '../theme';
import { useTicks } from '../ticks';

/** The 20×20 box in the 32 lane: outlined, or accent with a tick. */
function Checkbox({ ticked }: { ticked: boolean }) {
  const colors = useColors();
  return (
    <Lane size="checkbox" style={{ height: 22, justifyContent: 'center' }}>
      <View
        style={{
          width: 20,
          height: 20,
          alignItems: 'center',
          justifyContent: 'center',
          ...(ticked ? { backgroundColor: colors.accentFill } : { borderWidth: 1, borderColor: colors.ink3 }),
        }}
      >
        {ticked && (
          <Text variant="secondary" color="onAccent" style={{ fontFamily: sans[600], fontSize: 13, lineHeight: 16 }}>
            ✓
          </Text>
        )}
      </View>
    </Lane>
  );
}

/** Amounts in different unit families are joined, then any that couldn't be added up: "200 g + a handful". */
const itemAmount = (item: ShoppingItem) =>
  [...item.amounts.map((a) => amount(a.quantity, a.unit)), ...item.unquantified].join(' + ');

/**
 * The week's shopping, grouped by aisle. `week` is the Monday to show; it defaults to this week.
 * Ticks stay on the device, and ticked rows stay where they are so the list doesn't jump.
 */
export default function Shopping() {
  const params = useLocalSearchParams<{ week?: string }>();
  const thisWeek = monday(today());
  const start = params.week ? monday(params.week) : thisWeek;
  const query = useApiQuery<ShoppingList>(['shopping', start], `/shopping?start=${start}&end=${addDays(start, 6)}`);
  const { ticked, ready, set } = useTicks(start);

  const items = query.data?.items ?? [];
  const aisles = [...new Set(items.map((i) => i.aisle))];
  const tickedCount = items.filter((i) => ticked.includes(i.ingredient_id)).length;
  const toggle = (id: string) => set(ticked.includes(id) ? ticked.filter((t) => t !== id) : [...ticked, id]);

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <TopBar left={<BackLink label="Home" />} right={<Text variant="label">{weekRange(start)}</Text>} />
      <PageHead
        title="Shopping list"
        lede={`${start === thisWeek ? "This week's plan" : `The plan for ${weekRange(start)}`}, grouped by aisle.`}
      />
      <QueryState query={query} />
      {query.data && !items.length && <StateLine text="Nothing planned" />}
      {items.length > 0 && (
        <Gutter>
          <SectionHeader
            title={`${items.length} ${items.length === 1 ? 'item' : 'items'} · ${tickedCount} ticked`}
            right={
              <TextAction
                label="Clear ticks"
                disabled={!tickedCount}
                onPress={() => set([])}
                style={{ alignSelf: 'auto' }}
              />
            }
            gap={4}
          />
          {aisles.map((aisle, a) => {
            const group = items.filter((i) => i.aisle === aisle);
            return (
              <View key={aisle}>
                <GroupLabel label={aisle} first={a === 0} />
                {group.map((item, i) => {
                  const isTicked = ticked.includes(item.ingredient_id);
                  return (
                    <IngredientRow
                      key={item.ingredient_id}
                      quantity={itemAmount(item)}
                      name={capitalise(item.ingredient)}
                      detail={item.recipes.join(' · ')}
                      tag={item.optional ? 'Optional' : undefined}
                      struck={isTicked}
                      checked={isTicked}
                      // The last row of the whole list closes it; a group label closes the others.
                      last={a === aisles.length - 1 && i === group.length - 1}
                      onPress={ready ? () => toggle(item.ingredient_id) : undefined}
                      trailing={<Checkbox ticked={isTicked} />}
                    />
                  );
                })}
              </View>
            );
          })}
        </Gutter>
      )}
    </Screen>
  );
}
