import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecipeSource } from '../src/recipe-source.ts';

test('extracts schema.org Recipe from an @graph, with sections and nutrition', () => {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: 'Page' },
      {
        '@type': ['Recipe'],
        name: 'Easy chicken curry',
        recipeYield: ['4', '4 servings'],
        cookTime: 'PT45M',
        image: { '@type': 'ImageObject', url: 'https://img/curry.jpg' },
        recipeIngredient: ['6 chicken thighs', '400g can chopped tomatoes &amp; juice'],
        recipeInstructions: [
          { '@type': 'HowToSection', name: 'Sauce', itemListElement: [{ '@type': 'HowToStep', text: '<p>Fry the onion.</p>' }] },
          { '@type': 'HowToStep', text: 'Add the chicken.' },
        ],
        nutrition: { '@type': 'NutritionInformation', calories: '354 calories', proteinContent: '24 g' },
      },
    ],
  };
  const html = `<html><head><title>x</title><script type="application/ld+json">{bad json</script>
    <script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`;
  const r = parseRecipeSource('https://example.com/curry', html);
  assert.equal(r.found, true);
  assert.equal(r.name, 'Easy chicken curry');
  assert.equal(r.yield, '4 / 4 servings');
  assert.equal(r.image, 'https://img/curry.jpg');
  assert.deepEqual(r.ingredients, ['6 chicken thighs', '400g can chopped tomatoes & juice']);
  assert.deepEqual(r.steps, [
    { section: 'Sauce', text: 'Fry the onion.' },
    { section: undefined, text: 'Add the chicken.' },
  ]);
  assert.deepEqual(r.nutrition, { calories: '354 calories', proteinContent: '24 g' });
});

test('falls back to page text without Recipe data', () => {
  const r = parseRecipeSource('https://e.com', '<title>Soup</title><style>x{}</style><p>Boil water.</p><li>Add salt</li>');
  assert.equal(r.found, false);
  assert.equal(r.name, 'Soup');
  assert.match(r.text!, /Boil water\.\nAdd salt/);
});
