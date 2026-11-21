import { useState } from 'react';
import type { Person, RecipeSummary } from '@feedr/core';
import { num } from '../../format';
import {
  BackLink,
  Field,
  Fill,
  Gutter,
  Lane,
  PageHead,
  PrimaryButton,
  Row,
  Screen,
  SectionHeader,
  Text,
  TextAction,
  TopBar,
} from '../../primitives';
import { router } from 'expo-router';
import { useApiQuery } from '../../store';

// Design mock: there is no delete endpoint yet, so the button only says so. The counts are live.

export default function DeleteAccount() {
  const recipes = useApiQuery<RecipeSummary[]>(['recipes', ''], '/recipes');
  const people = useApiQuery<Person[]>(['people'], '/people');
  const [typed, setTyped] = useState('');
  const [tried, setTried] = useState(false);
  const ready = typed.trim().toUpperCase() === 'DELETE';

  const removed = [
    {
      what: 'Recipes',
      detail: recipes.data ? `${num(recipes.data.length)} recipes and their versions` : 'Every recipe and its versions',
    },
    { what: 'Meal plans', detail: 'Every planned meal, past and future' },
    {
      what: 'People',
      detail: people.data ? `${num(people.data.length)} people and their targets` : 'Everyone you cook for',
    },
    { what: 'Agent access', detail: 'Every token, so connected agents stop working' },
  ];

  return (
    <Screen>
      <TopBar left={<BackLink label="Account" fallback="/account" />} />
      <PageHead
        title="Delete account"
        lede="This deletes your account and everything in it straight away. It can't be undone."
      />
      <Gutter>
        <SectionHeader ruled title="What goes" meta="Permanently" />
        {removed.map((item, i) => (
          <Row key={item.what} pad={12} rule={i > 0} last={i === removed.length - 1}>
            <Lane size="number">
              <Text variant="stepNumber" style={{ lineHeight: 22 }}>
                {String(i + 1).padStart(2, '0')}
              </Text>
            </Lane>
            <Fill style={{ gap: 1 }}>
              <Text variant="itemName">{item.what}</Text>
              <Text variant="secondary">{item.detail}</Text>
            </Fill>
          </Row>
        ))}
        <Text variant="note" style={{ paddingTop: 16 }}>
          If you share a home, the other person keeps it, with a copy of the recipes. Want a copy first?
        </Text>
        <TextAction label="Export my data" style={{ marginTop: 14 }} onPress={() => {}} />
      </Gutter>
      <Gutter style={{ paddingTop: 36 }}>
        <Field
          label="Type DELETE to confirm"
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="DELETE"
        />
        <PrimaryButton
          label="Delete my account"
          disabled={!ready}
          onPress={() => setTried(true)}
          style={{ marginTop: 24 }}
        />
        {tried && (
          <Text variant="label" color="accent" style={{ marginTop: 12 }}>
            Deleting accounts isn’t built yet. Nothing was deleted.
          </Text>
        )}
        <TextAction
          label="Keep my account"
          style={{ marginTop: 18 }}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/account'))}
        />
      </Gutter>
    </Screen>
  );
}
