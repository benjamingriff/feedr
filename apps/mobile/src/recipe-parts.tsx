import type { ReactNode } from 'react';
import { View } from 'react-native';
import { matchIngredientNames, type IngredientLine, type RecipeVersion, type Step } from '@feedr/core';
import { amount, capitalise } from './format';
import { Chip, Fill, Lane, Row, Text } from './primitives';
import { mono } from './theme';

// What the recipe page and cook mode share: ingredient rows, and finding a step's ingredients
// and where they appear in its text.

/** The quantity lane's text: quantity and unit, or the cook's line when there's no quantity. */
export function lineAmount(line: IngredientLine) {
  return line.quantity == null ? line.raw_text : amount(line.quantity, line.unit);
}

/**
 * An ingredient row: the 92 quantity lane, then the name with an optional tag and second line.
 * `struck` is a ticked shopping item; `highlight` is cook mode's active ingredient.
 */
export function IngredientRow({
  quantity,
  name,
  detail,
  tag,
  last = false,
  highlight = false,
  struck = false,
  trailing,
  onPress,
  checked,
}: {
  quantity: string;
  name: string;
  detail?: ReactNode;
  tag?: string;
  last?: boolean;
  highlight?: boolean;
  struck?: boolean;
  trailing?: ReactNode;
  onPress?: () => void;
  checked?: boolean;
}) {
  const strike = struck ? ({ textDecorationLine: 'line-through' } as const) : undefined;
  return (
    <Row last={last} highlight={highlight} onPress={onPress} label={name} role="checkbox" checked={checked}>
      <Lane size="label" style={{ paddingRight: 8 }}>
        <Text
          variant="quantity"
          color={struck ? 'ink3' : highlight ? 'ink' : 'ink2'}
          style={[strike, highlight && { fontFamily: mono[500] }]}
        >
          {quantity}
        </Text>
      </Lane>
      <Fill style={{ gap: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text variant="itemName" color={struck ? 'ink3' : highlight ? 'accent' : 'ink'} style={strike}>
            {name}
          </Text>
          {!!tag && <Chip kind="tag" label={tag} />}
        </View>
        {!!detail && <Text variant="secondary">{detail}</Text>}
      </Fill>
      {trailing}
    </Row>
  );
}

export interface Term {
  start: number;
  end: number;
  line: IngredientLine;
}

/**
 * A step's ingredients and where they're named in its text. The step's links say which lines it
 * uses; without links, any line named in the text counts.
 */
export function stepIngredients(step: Step, version: RecipeVersion): { lines: IngredientLine[]; terms: Term[] } {
  const linked = new Set(step.ingredients.map((i) => i.line_id));
  const candidates = linked.size ? version.ingredients.filter((l) => linked.has(l.id)) : version.ingredients;
  const terms = matchIngredientNames(
    step.text,
    candidates.map((l) => l.ingredient),
  ).map((m) => ({ start: m.start, end: m.end, line: candidates[m.index]! }));
  const named = new Set(terms.map((t) => t.line.id));
  return { lines: linked.size ? candidates : candidates.filter((l) => named.has(l.id)), terms };
}

/** The amount a step uses: its own when the link sets one, otherwise the whole line. */
export function stepAmount(step: Step, line: IngredientLine) {
  const link = step.ingredients.find((i) => i.line_id === line.id);
  return link?.quantity == null ? lineAmount(line) : amount(link.quantity, link.unit ?? line.unit);
}

/**
 * "· 4 of 6, 2 for step 05": how a line is shared between steps. Empty unless this step has
 * its own amount for the line.
 */
export function splitNote(step: Step, line: IngredientLine, version: RecipeVersion) {
  const mine = step.ingredients.find((i) => i.line_id === line.id);
  if (mine?.quantity == null || line.quantity == null) return '';
  const others = version.steps.flatMap((other) =>
    other.id === step.id
      ? []
      : other.ingredients
          .filter((i) => i.line_id === line.id && i.quantity != null)
          .map((i) => ({ ...i, step: stepNumber(other.position) })),
  );
  // Bare numbers when every amount is in the line's unit ("4 of 6"); otherwise units on
  // all of them ("100 g of 1 kg"), so different units are never compared as numbers.
  const sameUnit = [mine, ...others].every((i) => (i.unit ?? line.unit) === line.unit);
  const show = (q: number, unit: string | null) => (sameUnit ? String(q) : amount(q, unit ?? line.unit));
  return ` · ${[
    `${show(mine.quantity, mine.unit)} of ${show(line.quantity, line.unit)}`,
    ...others.map((i) => `${show(i.quantity!, i.unit)} for step ${i.step}`),
  ].join(', ')}`;
}

/** "03" for the step at position 2. */
export const stepNumber = (position: number) => String(position + 1).padStart(2, '0');

/** The prep line, sentence-cased: "Thinly sliced". */
export const prepLine = (line: IngredientLine) => (line.preparation ? capitalise(line.preparation) : undefined);

const DURATION = /\d+(?:[–-]\d+)?\s?(?:min(?:ute)?s?|hrs?|hours?|sec(?:ond)?s?)\b/gi;

export type Piece = { text: string; term?: Term; duration?: boolean };

/** Splits step text into plain runs, ingredient terms and durations ("8–10 min"), in order. */
export function stepPieces(text: string, terms: Term[]): Piece[] {
  const pieces: Piece[] = [];
  const plain = (from: number, to: number) => {
    const run = text.slice(from, to);
    let at = 0;
    for (const m of run.matchAll(DURATION)) {
      if (m.index > at) pieces.push({ text: run.slice(at, m.index) });
      pieces.push({ text: m[0], duration: true });
      at = m.index + m[0].length;
    }
    if (at < run.length) pieces.push({ text: run.slice(at) });
  };
  let at = 0;
  for (const term of terms) {
    plain(at, term.start);
    pieces.push({ text: text.slice(term.start, term.end), term });
    at = term.end;
  }
  plain(at, text.length);
  return pieces;
}
