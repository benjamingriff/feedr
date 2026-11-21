import { useState } from 'react';
import { Monogram } from '../../account-parts';
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

// Design mock: there is no household API yet. Any username finds "Jess", and sending only
// flips this screen to its pending state.

const SHARED = [
  { title: 'Cookbook', detail: 'Both your recipes, in one cookbook' },
  { title: 'Meal plan', detail: "One week, with each person's portions" },
  { title: 'Shopping list', detail: 'One list, ticked off together' },
  { title: 'People', detail: "You'll both appear, with your own targets" },
];

export default function Invite() {
  const [query, setQuery] = useState('jess.carter');
  const [sent, setSent] = useState(false);
  const found = query.trim().length >= 2;

  return (
    <Screen>
      <TopBar left={<BackLink label="Account" fallback="/account" />} right={<Text variant="label">Your home</Text>} />
      <PageHead
        title={sent ? 'Invite sent' : 'Invite to your home'}
        lede={
          sent
            ? 'Jess will see it next time they open Feedr. Your home is shared as soon as they accept.'
            : 'They keep their own login. Once they accept, you cook from the same plan.'
        }
      />
      <Gutter>
        {!sent && (
          <Field
            label="Username or ID"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="jess.carter"
          />
        )}
        {found && (
          <Row pad={16} align="center" gap={14} rule={false} last>
            <Monogram name="Jess Carter" size={40} />
            <Fill style={{ gap: 1 }}>
              <Text variant="itemName">Jess Carter</Text>
              <Text variant="secondary">@jess.carter</Text>
            </Fill>
            <Text variant="tag" color={sent ? 'accent' : 'ink3'}>
              {sent ? 'Pending' : 'Found'}
            </Text>
          </Row>
        )}
      </Gutter>

      {found && !sent && (
        <Gutter style={{ paddingTop: 36 }}>
          <SectionHeader ruled title="What you'll share" meta={`${SHARED.length} things`} />
          {SHARED.map((item, i) => (
            <Row key={item.title} pad={12} rule={i > 0} last={i === SHARED.length - 1}>
              <Lane size="number">
                <Text variant="stepNumber" style={{ lineHeight: 22 }}>
                  {String(i + 1).padStart(2, '0')}
                </Text>
              </Lane>
              <Fill style={{ gap: 1 }}>
                <Text variant="itemName">{item.title}</Text>
                <Text variant="secondary">{item.detail}</Text>
              </Fill>
            </Row>
          ))}
          <Text variant="note" style={{ paddingTop: 16, paddingBottom: 20 }}>
            Your logins and agent tokens stay your own. Either of you can leave the home later and take a copy of the
            recipes.
          </Text>
          <PrimaryButton label="Send invite to Jess" onPress={() => setSent(true)} />
        </Gutter>
      )}

      {sent && (
        <Gutter style={{ paddingTop: 18 }}>
          <TextAction label="Cancel invite" onPress={() => setSent(false)} />
        </Gutter>
      )}
    </Screen>
  );
}
