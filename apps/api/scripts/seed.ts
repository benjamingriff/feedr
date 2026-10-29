// Sample data for trying the app: npm run seed -- <userId>
// Creates two people, two recipes (one with a scaled version) and services for the current week.
import { db } from '../src/db.ts';
import * as svc from '../src/service.ts';

const userId = process.argv[2];
if (!userId) throw new Error('Usage: npm run seed -- <userId>  (from npm run account:create)');

const n = (kcal: number, protein_g: number, carbs_g: number, fat_g: number) => ({
  kcal, protein_g, carbs_g, fat_g, saturated_fat_g: fat_g * 0.3, fibre_g: carbs_g * 0.1, sugar_g: carbs_g * 0.15, salt_g: 4,
  source: 'agent_estimate' as const,
});

const me = await svc.createPerson(userId, { name: 'Me', weight_kg: 80, daily_kcal: 2800, daily_protein_g: 170 });
const partner = await svc.createPerson(userId, { name: 'Partner', weight_kg: 62, daily_kcal: 2000, daily_protein_g: 110 });

const curry = await svc.createRecipe(userId, {
  title: 'Chicken tikka masala',
  description: 'Weeknight curry with charred chicken thighs in a spiced tomato and yoghurt sauce.',
  source_url: 'https://example.com/chicken-tikka-masala',
  source_name: 'Example Kitchen',
  tags: ['curry', 'batch', 'high protein'],
  original: {
    servings: 4,
    prep_minutes: 20,
    cook_minutes: 35,
    ingredients: [
      { ingredient: 'chicken thigh', aisle: 'Meat & fish', quantity: 800, unit: 'g', raw_text: '800g boneless chicken thighs, diced', section: 'For the chicken' },
      { ingredient: 'Greek yoghurt', aisle: 'Dairy', quantity: 150, unit: 'g', raw_text: '150g Greek yoghurt', section: 'For the chicken' },
      { ingredient: 'garam masala', aisle: 'Spices', quantity: 2, unit: 'tsp', raw_text: '2 tsp garam masala', section: 'For the chicken' },
      { ingredient: 'onion', aisle: 'Produce', quantity: 2, raw_text: '2 onions, finely chopped', preparation: 'finely chopped', section: 'For the sauce' },
      { ingredient: 'garlic', aisle: 'Produce', quantity: 4, unit: 'clove', raw_text: '4 garlic cloves, grated', section: 'For the sauce' },
      { ingredient: 'chopped tomatoes', aisle: 'Tins & jars', quantity: 1, unit: 'tin', raw_text: '1 × 400g tin chopped tomatoes', section: 'For the sauce' },
      { ingredient: 'double cream', aisle: 'Dairy', quantity: 100, unit: 'ml', raw_text: '100ml double cream', section: 'For the sauce', optional: true },
      { ingredient: 'basmati rice', aisle: 'Rice & pasta', quantity: 300, unit: 'g', raw_text: '300g basmati rice' },
      { ingredient: 'salt', aisle: 'Spices', raw_text: 'Salt, to taste' },
    ],
    steps: [
      { text: 'Mix the chicken with the yoghurt, half the garam masala and a pinch of salt. Leave for 10 minutes.', timer_seconds: 600 },
      { text: 'Grill or pan-fry the chicken on a high heat until charred at the edges.' },
      { text: 'Soften the onions in oil for 10 minutes, then add the garlic and remaining garam masala for 1 minute.', timer_seconds: 600 },
      { text: 'Add the tomatoes and simmer for 15 minutes. Stir in the chicken and cream and warm through.', timer_seconds: 900 },
      { text: 'Cook the rice following the packet and serve.' },
    ],
    nutrition: { ...n(2600, 210, 290, 70), source: 'from_source' },
  },
});
const curryForFive = await svc.createVersion(userId, curry.id, {
  label: 'Two dinners + two lunches',
  servings: 5,
  based_on_version_id: curry.versions[0]!.id,
  notes: 'Chicken to 1kg and rice to 375g. Kept 2 onions and the full tin; garam masala up to 2½ tsp, not a straight 2.5×.',
  prep_minutes: 20,
  cook_minutes: 40,
  ingredients: [
    { ingredient: 'chicken thigh', quantity: 1000, unit: 'g', raw_text: '1kg boneless chicken thighs, diced', section: 'For the chicken' },
    { ingredient: 'Greek yoghurt', quantity: 180, unit: 'g', raw_text: '180g Greek yoghurt', section: 'For the chicken' },
    { ingredient: 'garam masala', quantity: 2.5, unit: 'tsp', raw_text: '2½ tsp garam masala', section: 'For the chicken' },
    { ingredient: 'onion', quantity: 2, raw_text: '2 large onions, finely chopped', section: 'For the sauce' },
    { ingredient: 'garlic', quantity: 5, unit: 'clove', raw_text: '5 garlic cloves, grated', section: 'For the sauce' },
    { ingredient: 'chopped tomatoes', quantity: 1, unit: 'tin', raw_text: '1 × 400g tin chopped tomatoes', section: 'For the sauce' },
    { ingredient: 'double cream', quantity: 120, unit: 'ml', raw_text: '120ml double cream', section: 'For the sauce', optional: true },
    { ingredient: 'basmati rice', quantity: 375, unit: 'g', raw_text: '375g basmati rice' },
    { ingredient: 'salt', raw_text: 'Salt, to taste' },
  ],
  steps: [
    { text: 'Mix the chicken with the yoghurt, half the garam masala and a pinch of salt. Leave for 10 minutes.', timer_seconds: 600 },
    { text: 'Grill or pan-fry the chicken in two batches on a high heat until charred at the edges.' },
    { text: 'Soften the onions in oil in a large pan for 12 minutes, then add the garlic and remaining garam masala for 1 minute.', timer_seconds: 720 },
    { text: 'Add the tomatoes and simmer for 15 minutes. Stir in the chicken and cream and warm through.', timer_seconds: 900 },
    { text: 'Cook the rice following the packet. Box two portions for tomorrow’s lunch once cooled.' },
  ],
  nutrition: n(3200, 262, 360, 86),
});

const porridge = await svc.createRecipe(userId, {
  title: 'Protein porridge',
  kind: 'full',
  tags: ['breakfast', 'quick'],
  original: {
    servings: 1,
    prep_minutes: 2,
    cook_minutes: 5,
    ingredients: [
      { ingredient: 'porridge oats', aisle: 'Cereals', quantity: 80, unit: 'g', raw_text: '80g porridge oats' },
      { ingredient: 'semi-skimmed milk', aisle: 'Dairy', quantity: 300, unit: 'ml', raw_text: '300ml semi-skimmed milk' },
      { ingredient: 'whey protein', aisle: 'Health', quantity: 30, unit: 'g', raw_text: '1 scoop (30g) whey protein' },
      { ingredient: 'banana', aisle: 'Produce', quantity: 1, raw_text: '1 banana, sliced' },
    ],
    steps: [
      { text: 'Simmer the oats and milk for 4–5 minutes, stirring.', timer_seconds: 300 },
      { text: 'Take off the heat, stir in the protein and top with banana.' },
    ],
    nutrition: n(720, 52, 98, 14),
  },
});

const monday = new Date();
monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
const day = (offset: number) => {
  const d = new Date(monday);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

await svc.planService(userId, {
  version_id: curryForFive.id,
  cook_date: day(0),
  portions: [
    { person_id: me.id, date: day(0), slot: 'dinner' },
    { person_id: partner.id, date: day(0), slot: 'dinner' },
    { person_id: me.id, date: day(1), slot: 'lunch' },
    { person_id: partner.id, date: day(1), slot: 'lunch' },
  ],
});
for (let i = 0; i < 5; i++) {
  await svc.planService(userId, {
    version_id: porridge.versions[0]!.id,
    cook_date: day(i),
    portions: [{ person_id: me.id, date: day(i), slot: 'breakfast' }],
  });
}

await db.destroy();
console.log(`Seeded 2 people, 2 recipes and this week's plan (from ${day(0)}).`);
