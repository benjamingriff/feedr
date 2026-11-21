import { useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { defaultVersion, type Recipe, type RecipeVersion, type Service, type Step } from '@feedr/core';
import { stampDate } from '../../dates';
import { capitalise, minutes, num, totalMinutes } from '../../format';
import {
  BackLink,
  Chip,
  Fill,
  GroupLabel,
  Gutter,
  Lane,
  MetaRow,
  PrimaryButton,
  QueryState,
  Screen,
  SectionHeader,
  Text,
  TextAction,
  TopBar,
} from '../../primitives';
import { IngredientRow, lineAmount, prepLine, stepIngredients, stepNumber, stepPieces } from '../../recipe-parts';
import { useApiQuery } from '../../store';
import { mono, sans, underline, useColors } from '../../theme';

/** Ingredients grouped by section. Sections only get labels when the version uses them. */
function Ingredients({ version }: { version: RecipeVersion }) {
  const sectioned = version.ingredients.some((l) => l.section);
  const groups = new Map<string, RecipeVersion['ingredients']>();
  for (const l of version.ingredients) {
    const key = l.section ?? 'Other';
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const last = version.ingredients.at(-1);
  return (
    <Gutter style={{ paddingTop: 36 }}>
      <SectionHeader
        title="Ingredients"
        meta={`${version.ingredients.length} items · for ${version.servings}`}
        gap={sectioned ? 0 : 14}
      />
      {[...groups].map(([section, lines], i) => (
        <View key={section}>
          {sectioned && <GroupLabel label={section} first={i === 0} />}
          {lines.map((l) => (
            <IngredientRow
              key={l.id}
              quantity={lineAmount(l)}
              name={capitalise(l.ingredient)}
              detail={prepLine(l)}
              tag={l.optional ? 'Optional' : undefined}
              // Only the very last row closes the list; a group label's hairline closes the others.
              last={l === last}
            />
          ))}
        </View>
      ))}
    </Gutter>
  );
}

/** A numbered step, with its ingredients' names marked and its timer as a chip. */
function MethodStep({ step, version }: { step: Step; version: RecipeVersion }) {
  const { terms } = stepIngredients(step, version);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <Lane size="number">
        <Text variant="stepNumber">{stepNumber(step.position)}</Text>
      </Lane>
      <Fill style={{ gap: 10 }}>
        <Text variant="body">
          {stepPieces(step.text, terms).map((piece, i) =>
            piece.term ? (
              <Text key={i} variant="body" style={[{ fontFamily: sans[500] }, underline('dotted', 4)]}>
                {piece.text}
              </Text>
            ) : (
              piece.text
            ),
          )}
        </Text>
        {step.timer_seconds != null && (
          <Chip kind="timer" label={`◷ Timer · ${minutes(Math.round(step.timer_seconds / 60))}`} />
        )}
      </Fill>
    </View>
  );
}

function PerServing({ version }: { version: RecipeVersion }) {
  const n = version.nutrition;
  if (!n) return null;
  const each = (total: number | null, unit = '') => (total == null ? '—' : `${num(total / version.servings)}${unit}`);
  return (
    <Gutter style={{ paddingTop: 48 }}>
      <SectionHeader
        ruled
        title="Per serving"
        right={
          n.source === 'agent_estimate' ? (
            <Text variant="chip" style={{ fontFamily: mono.italic }}>
              [agent estimate]
            </Text>
          ) : undefined
        }
      />
      <MetaRow
        large
        style={{ paddingTop: 14 }}
        items={[
          { label: 'Kcal', value: each(n.kcal) },
          { label: 'Protein', value: each(n.protein_g, ' g') },
          { label: 'Carbs', value: each(n.carbs_g, ' g') },
          { label: 'Fat', value: each(n.fat_g, ' g') },
        ]}
      />
    </Gutter>
  );
}

function SourceFooter({ recipe }: { recipe: Recipe }) {
  const colors = useColors();
  const url = recipe.source_url;
  const source = recipe.source_name ?? (url ? new URL(url).host.replace(/^www\./, '') : null);
  // The original version is written with the recipe, so its timestamp is when the recipe was added.
  const added = recipe.versions.find((v) => v.is_original)?.created_at;
  return (
    <Gutter style={{ paddingTop: 48, gap: 6 }}>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 16 }}>
        <Text variant="label">Source</Text>
      </View>
      <Text variant="secondary" style={{ lineHeight: 21 }}>
        {source && (
          <>
            Adapted from{' '}
            {url ? (
              <Text
                variant="secondary"
                accessibilityRole="link"
                style={[{ lineHeight: 21 }, underline('dotted', 4)]}
                onPress={() => void Linking.openURL(url)}
              >
                {source}
              </Text>
            ) : (
              source
            )}
            .{' '}
          </>
        )}
        {added ? `Added on ${stampDate(added)}; last changed ${stampDate(recipe.updated_at)}.` : null}
      </Text>
    </Gutter>
  );
}

/**
 * A recipe, read-only. Opened from the plan it shows the version that was planned and offers
 * Dish up; from the cookbook it shows the default version.
 */
export default function RecipeScreen() {
  const { id, serviceId } = useLocalSearchParams<{ id: string; serviceId?: string }>();
  const colors = useColors();
  const query = useApiQuery<Recipe>(['recipe', id], `/recipes/${id}`);
  const service = useApiQuery<Service>(['service', serviceId], `/services/${serviceId}`, { enabled: !!serviceId });
  const [chosen, setChosen] = useState<string | null>(null);

  const recipe = query.data;
  const versions = recipe?.versions ?? [];
  // A planned recipe shows the planned version, so it waits for its service (and shows its
  // error) rather than falling back to the default version.
  const planned = serviceId ? service.data?.version_id : undefined;
  const version = chosen
    ? versions.find((v) => v.id === chosen)
    : serviceId
      ? service.data && (versions.find((v) => v.id === planned) ?? defaultVersion(versions))
      : defaultVersion(versions);
  const next = version && versions[(versions.indexOf(version) + 1) % versions.length];
  const time = version && totalMinutes(version);
  const kcal = version?.nutrition?.kcal;

  return (
    <Screen
      refreshing={query.isRefetching}
      onRefresh={() => {
        void query.refetch();
        if (serviceId) void service.refetch();
      }}
    >
      <TopBar left={<BackLink label={serviceId ? 'Plan' : 'Recipes'} fallback={serviceId ? '/plan' : '/cookbook'} />} />
      <QueryState query={query} />
      {serviceId && recipe && <QueryState query={service} />}
      {recipe && version && (
        <>
          <Gutter style={{ paddingTop: 24, paddingBottom: 32, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            {recipe.tags.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 16 }}>
                {recipe.tags.map((tag) => (
                  <Chip key={tag} label={capitalise(tag)} />
                ))}
              </View>
            )}
            <Text variant="pageTitle" accessibilityRole="header">
              {recipe.title}
            </Text>
            {!!recipe.description && (
              <Text variant="body" style={{ paddingTop: 12 }}>
                {recipe.description}
              </Text>
            )}
            <MetaRow
              style={{ paddingVertical: 26 }}
              items={[
                { label: 'Serves', value: String(version.servings) },
                { label: 'Prep', value: version.prep_minutes == null ? '—' : minutes(version.prep_minutes) },
                { label: 'Cook', value: version.cook_minutes == null ? '—' : minutes(version.cook_minutes) },
                { label: 'Kcal', value: kcal == null ? '—' : num(kcal / version.servings) },
              ]}
            />
            {!!version.notes && (
              <View
                style={{
                  borderLeftWidth: 1,
                  borderLeftColor: colors.accent,
                  paddingLeft: 16,
                  paddingVertical: 2,
                  gap: 6,
                }}
              >
                <Text variant="label" color="accent">
                  Agent note · For {version.servings}
                </Text>
                <Text variant="note">{version.notes}</Text>
              </View>
            )}
            {next && next !== version && (
              <TextAction
                label={`${versions.length} versions · ${next.label} →`}
                onPress={() => setChosen(next.id)}
                style={{ marginTop: version.notes ? 16 : 0 }}
              />
            )}
            <PrimaryButton
              label={`Start cooking · ${version.steps.length} steps`}
              disabled={!version.steps.length}
              style={{ marginTop: version.notes || next !== version ? 28 : 2 }}
              onPress={() =>
                router.push({
                  pathname: '/cook/[versionId]',
                  // Dish-up only follows when cooking the version that was planned.
                  params: {
                    versionId: version.id,
                    recipeId: recipe.id,
                    ...(version.id === planned ? { serviceId } : {}),
                  },
                })
              }
            />
            {serviceId && version.id === planned && (
              <TextAction
                label="Dish up →"
                onPress={() => router.push({ pathname: '/service/[id]', params: { id: serviceId } })}
                style={{ marginTop: 20 }}
              />
            )}
          </Gutter>
          <Ingredients version={version} />
          <Gutter style={{ paddingTop: 44, gap: 22 }}>
            <SectionHeader
              title="Method"
              meta={[`${version.steps.length} steps`, time != null && minutes(time)].filter(Boolean).join(' · ')}
              gap={4}
            />
            {version.steps.map((step) => (
              <MethodStep key={step.id} step={step} version={version} />
            ))}
          </Gutter>
          <PerServing version={version} />
          <SourceFooter recipe={recipe} />
        </>
      )}
    </Screen>
  );
}
