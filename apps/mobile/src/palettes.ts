// The colour palettes, kept free of React Native so scripts/icons.ts can read them in Node.
// theme.ts re-exports everything here, so app code imports from there.

/** The colour roles every palette fills, in one appearance. */
export type Colors = {
  bg: string;
  bgRaised: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  /** Accent text, numbers and rules. */
  accent: string;
  /** Solid accent areas: the primary button, brand square and ticks. */
  accentFill: string;
  /** Text and glyphs drawn on `accentFill`. */
  onAccent: string;
  /** Accent at 9%: the highlighted ingredient row in cook mode. */
  accentTint: string;
};
export type ColorName = keyof Colors;

/**
 * Fills in the derived roles. `accentFill` defaults to `accent` and `onAccent` to `bg`; a palette
 * only sets them when its fill colour can't also be read as text (Yolk's yellow on white).
 */
function colors(
  c: Omit<Colors, 'accentFill' | 'onAccent' | 'accentTint'> & Partial<Pick<Colors, 'accentFill' | 'onAccent'>>,
): Colors {
  return { accentFill: c.accent, onAccent: c.bg, ...c, accentTint: `${c.accent}17` };
}

/**
 * The colour palettes a person can pick from, each with a light and a dark set. Cobalt is the
 * default; Clay is the original design. To add one, add an entry here, then run
 * `pnpm --filter @feedr/mobile icons` to draw its app icon. The picker lists them in this order.
 */
export const palettes = {
  Cobalt: {
    description: 'Ink blue on white',
    light: colors({
      bg: '#ffffff',
      bgRaised: '#f2f3f6',
      ink: '#0d0f14',
      ink2: '#444852',
      ink3: '#6e727c',
      line: '#0d0f141a',
      accent: '#2341e0',
    }),
    dark: colors({
      bg: '#0a0b0f',
      bgRaised: '#16181e',
      ink: '#f3f4f7',
      ink2: '#b4b8c2',
      ink3: '#868a94',
      line: '#f3f4f71f',
      accent: '#6f86ff',
    }),
  },
  Clay: {
    description: 'Terracotta on warm paper',
    light: colors({
      bg: '#faf9f5',
      bgRaised: '#f1efe8',
      ink: '#141413',
      ink2: '#4c4b45',
      ink3: '#7b7a72',
      line: '#1414131c',
      accent: '#c15f3c',
    }),
    dark: colors({
      bg: '#141413',
      bgRaised: '#22211f',
      ink: '#faf9f5',
      ink2: '#b0aea5',
      ink3: '#87867f',
      line: '#faf9f51c',
      accent: '#d97757',
    }),
  },
  Basil: {
    description: 'Herb green on pale sage',
    light: colors({
      bg: '#f5f7f2',
      bgRaised: '#ebefe7',
      ink: '#142019',
      ink2: '#46524a',
      ink3: '#65716a',
      line: '#1420191f',
      accent: '#2f6b3f',
    }),
    dark: colors({
      bg: '#0e1410',
      bgRaised: '#18201a',
      ink: '#ecf1ea',
      ink2: '#b3bdb5',
      ink3: '#85908a',
      line: '#ecf1ea1f',
      accent: '#8cc59a',
    }),
  },
  Yolk: {
    description: 'Chrome yellow on white',
    light: colors({
      bg: '#ffffff',
      bgRaised: '#f3f3f1',
      ink: '#111111',
      ink2: '#444444',
      ink3: '#707070',
      line: '#1111111a',
      // Yellow can't be read on white, so accent text is a dark ochre and the yellow is fill only.
      accent: '#8a6400',
      accentFill: '#ffc72c',
      onAccent: '#111111',
    }),
    dark: colors({
      bg: '#111111',
      bgRaised: '#1d1d1d',
      ink: '#f5f5f2',
      ink2: '#b5b5b0',
      ink3: '#888888',
      line: '#ffffff1c',
      accent: '#ffc72c',
    }),
  },
  Beetroot: {
    description: 'Deep beet on blush white',
    light: colors({
      bg: '#fbf9fa',
      bgRaised: '#f3eff1',
      ink: '#1a1418',
      ink2: '#4f454b',
      ink3: '#7a6f75',
      line: '#1a14181c',
      accent: '#9e1f55',
    }),
    dark: colors({
      bg: '#151013',
      bgRaised: '#211a1e',
      ink: '#f6eff3',
      ink2: '#bdb1b8',
      ink3: '#8d8189',
      line: '#f6eff31f',
      accent: '#ee6fa3',
    }),
  },
} satisfies Record<string, { description: string; light: Colors; dark: Colors }>;
export type PaletteName = keyof typeof palettes;
export const paletteNames = Object.keys(palettes) as PaletteName[];

/**
 * The palette a new install opens in. Its icon is the app's primary icon; every other palette
 * ships as an alternate icon that the app switches to when it's picked.
 */
export const defaultPalette: PaletteName = 'Cobalt';
