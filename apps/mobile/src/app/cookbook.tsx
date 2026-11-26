import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { defaultVersion, type Person, type RecipeSummary, type Service, type Slot } from '@feedr/core';
import { shortDate } from '../dates';
import { minutes, num, totalMinutes } from '../format';
import {
  ArrowLane,
  BackLink,
  ErrorLine,
  Fill,
  Gutter,
  PageHead,
  QueryState,
  Row,
  Screen,
  StateLine,
  Text,
  TopBar,
  inputStyle,
} from '../primitives';
import { useApiQuery, useStore } from '../store';
import { mono, useColors } from '../theme';

// Meal-type tags. A treat is something sweet, like a weekend bake.
const TABS = ['all', 'breakfast', 'lunch', 'dinner', 'treat'] as const;
type Tab = (typeof TABS)[number];

const hasTag = (recipe: RecipeSummary, tag: string) => recipe.tags.some((t) => t.toLowerCase() === tag);

/** "1 hr · Serves 2 · 640 kcal" for the version a recipe opens on. */
function rowMeta(recipe: RecipeSummary) {
  const version = defaultVersion(recipe.versions);
  if (!version) return '';
  const time = totalMinutes(version);
  return [
    time != null && minutes(time),
    `Serves ${version.servings}`,
    version.kcal != null && `${num(version.kcal / version.servings)} kcal`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function FilterTabs({ recipes, tab, onChange }: { recipes: RecipeSummary[]; tab: Tab; onChange: (tab: Tab) => void }) {
  const colors = useColors();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      {TABS.map((t) => {
        const active = t === tab;
        const count = t === 'all' ? recipes.length : recipes.filter((r) => hasTag(r, t)).length;
        return (
          <Pressable
            key={t}
            accessibilityRole="tab"
            aria-selected={active}
            hitSlop={6}
            onPress={() => onChange(t)}
            style={
              active
                ? { paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: colors.accent }
                : { paddingTop: 10, paddingBottom: 11 }
            }
          >
            <Text variant="label" color={active ? 'ink' : 'ink3'} style={active && { fontFamily: mono[500] }}>
              {t} {count}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The cookbook. Opened from the plan with `date` and `slot` it's in pick mode: tapping a recipe
 * plans its default version for everyone at that meal, then returns to the plan.
 */
export default function Cookbook() {
  const { date, slot } = useLocalSearchParams<{ date?: string; slot?: Slot }>();
  const picking = !!date && !!slot;
  const colors = useColors();
  const { api } = useStore();
  const client = useQueryClient();

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const [tab, setTab] = useState<Tab>(picking && slot !== 'snack' ? slot : 'all');

  const query = useApiQuery<RecipeSummary[]>(['recipes', q], `/recipes${q ? `?q=${encodeURIComponent(q)}` : ''}`, {
    keepPrevious: true,
  });
  const people = useApiQuery<Person[]>(['people'], '/people', { enabled: picking });
  const recipes = query.data ?? [];
  const shown = tab === 'all' ? recipes : recipes.filter((r) => hasTag(r, tab));

  const pick = useMutation({
    mutationFn: (recipe: RecipeSummary) => {
      const version = defaultVersion(recipe.versions);
      if (!version || !people.data?.length) throw new Error('Add a person in People before planning meals.');
      // No target_kcal: the server works each portion out from the person and slot.
      return api<Service>('/services', {
        version_id: version.id,
        cook_date: date,
        portions: people.data.map((p) => ({ person_id: p.id, date, slot })),
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries();
      router.back();
    },
  });

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <TopBar left={<BackLink label={picking ? 'Plan' : 'Home'} fallback={picking ? '/plan' : '/'} flush />} />
      <PageHead
        compact
        title={picking ? `Add ${slot}` : 'Cookbook'}
        lede={
          picking
            ? shortDate(date)
            : query.data &&
              `${recipes.length} ${recipes.length === 1 ? 'recipe' : 'recipes'}${q ? ` for “${q}”.` : ', kept up to date by your agent.'}`
        }
      />
      <Gutter>
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, marginBottom: 6 }}>
          <TextInput
            accessibilityLabel="Search recipes"
            placeholder="Search"
            placeholderTextColor={colors.ink3}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={[inputStyle, { color: colors.ink, paddingVertical: 12 }]}
          />
        </View>
        <FilterTabs recipes={recipes} tab={tab} onChange={setTab} />
        <ErrorLine error={pick.error} />
      </Gutter>
      <QueryState query={query} />
      {query.data && !shown.length && <StateLine text={q ? 'No recipes match' : 'No recipes yet'} />}
      <Gutter>
        {shown.map((recipe) => (
          <Row
            key={recipe.id}
            align="center"
            pad={16}
            gap={12}
            rule={false}
            last
            label={recipe.title}
            role={picking ? 'button' : 'link'}
            onPress={() =>
              picking
                ? !pick.isPending && pick.mutate(recipe)
                : router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })
            }
          >
            <Fill style={{ gap: 5 }}>
              <Text variant="listTitle">{recipe.title}</Text>
              <Text variant="label">{rowMeta(recipe)}</Text>
            </Fill>
            <ArrowLane small />
          </Row>
        ))}
      </Gutter>
    </Screen>
  );
}
