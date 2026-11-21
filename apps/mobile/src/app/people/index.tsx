import { router } from 'expo-router';
import type { Person } from '@feedr/core';
import { num } from '../../format';
import {
  ArrowLane,
  BackLink,
  Fill,
  Gutter,
  PageHead,
  QueryState,
  Row,
  Screen,
  Text,
  TextAction,
  TopBar,
} from '../../primitives';
import { useApiQuery } from '../../store';

/** Who you cook for. Agent tokens and signing out live on Account. */
export default function People() {
  const query = useApiQuery<Person[]>(['people'], '/people');
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
            onPress={() => router.push({ pathname: '/people/[id]', params: { id: person.id } })}
          >
            <Fill style={{ gap: 1 }}>
              <Text variant="itemName">{person.name}</Text>
              <Text variant="secondary">
                {[
                  `${num(person.daily_kcal)} kcal`,
                  person.daily_protein_g != null && `${num(person.daily_protein_g)} g protein`,
                ]
                  .filter(Boolean)
                  .join(' · ')}{' '}
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
            onPress={() => router.push({ pathname: '/people/[id]', params: { id: 'new' } })}
          />
        )}
      </Gutter>
    </Screen>
  );
}
