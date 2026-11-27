import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countName, pluralise, quantityText } from '../src/index.ts';

test('spoons and counts read as fractions, metric as numbers', () => {
  const read = (q: number, unit: string | null) => quantityText(q, unit);
  assert.equal(read(0.125, 'tsp'), '⅛');
  assert.equal(read(1.5, 'tsp'), '1½');
  assert.equal(read(0.75, 'tbsp'), '¾');
  assert.equal(read(0.375, 'tsp'), '⅜');
  assert.equal(read(0.33, 'cup'), '⅓');
  assert.equal(read(2.667, null), '2⅔');
  assert.equal(read(2, 'clove'), '2');
  assert.equal(read(1.999, null), '2');
  // No simple fraction: a rounded decimal.
  assert.equal(read(0.37, 'tsp'), '0.37');
  assert.equal(read(1.2345, null), '1.23');
  // Metric units keep the number as given.
  assert.equal(read(250, 'g'), '250');
  assert.equal(read(0.5, 'kg'), '0.5');
  assert.equal(read(12.5, 'ml'), '12.5');
  assert.equal(read(1.5, 'litres'), '1.5');
});

test('names are pluralised by their last word', () => {
  assert.equal(pluralise('egg'), 'eggs');
  assert.equal(pluralise('dried red chilli'), 'dried red chillies');
  assert.equal(pluralise('bay leaf'), 'bay leaves');
  assert.equal(pluralise('tomato'), 'tomatoes');
  assert.equal(pluralise('peach'), 'peaches');
  assert.equal(pluralise('radish'), 'radishes');
  assert.equal(pluralise('box'), 'boxes');
  assert.equal(pluralise('cherry'), 'cherries');
  assert.equal(pluralise('turkey'), 'turkeys');
});

test('only a unitless count of more than one is plural', () => {
  assert.equal(countName('egg', 2, null), 'eggs');
  assert.equal(countName('egg', 1, null), 'egg');
  assert.equal(countName('garlic', 2, 'clove'), 'garlic');
  assert.equal(countName('salt', null, null), 'salt');
});
