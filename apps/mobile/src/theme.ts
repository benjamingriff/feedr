import { createContext, useContext } from 'react';
import { Platform, useColorScheme, type TextStyle } from 'react-native';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono/400Regular';
import { GeistMono_400Regular_Italic } from '@expo-google-fonts/geist-mono/400Regular_Italic';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono/500Medium';
import { GoogleSans_500Medium } from '@expo-google-fonts/google-sans/500Medium';
import { HankenGrotesk_400Regular } from '@expo-google-fonts/hanken-grotesk/400Regular';
import { HankenGrotesk_500Medium } from '@expo-google-fonts/hanken-grotesk/500Medium';
import { HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk/600SemiBold';
import { type ColorName, type Colors, type PaletteName, defaultPalette, palettes } from './palettes';

export { type ColorName, type Colors, type PaletteName, paletteNames, palettes } from './palettes';

// Tokens, type roles and layout constants from design/README.md. Values are exact; don't round them.

/** "system" follows the phone; "light" and "dark" pin it. */
export type Mode = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';
export type Appearance = { palette: PaletteName; mode: Mode };
export const defaultAppearance: Appearance = { palette: defaultPalette, mode: 'system' };

/** The chosen appearance and its setters. `AppearanceProvider` in appearance.tsx supplies it. */
export const AppearanceContext = createContext<
  Appearance & { setPalette: (palette: PaletteName) => void; setMode: (mode: Mode) => void }
>({ ...defaultAppearance, setPalette: () => {}, setMode: () => {} });

/** The chosen palette and mode with their setters, for settings screens. */
export function useAppearance() {
  return useContext(AppearanceContext);
}

/** Light or dark, after applying the person's mode to the system appearance. */
export function useScheme(): Scheme {
  const { mode } = useContext(AppearanceContext);
  const system = useColorScheme();
  return mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
}

/** The colours for the chosen palette in the current scheme. */
export function useColors(): Colors {
  const { palette } = useContext(AppearanceContext);
  return palettes[palette][useScheme()];
}

/** Loaded in the root layout before anything renders. Each weight is its own family. */
export const fonts = {
  GeistMono_400Regular,
  GeistMono_400Regular_Italic,
  GeistMono_500Medium,
  /** Only for the "Continue with Google" button, which Google's branding rules set in Google Sans. */
  GoogleSans_500Medium,
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
};

export const sans = {
  400: 'HankenGrotesk_400Regular',
  500: 'HankenGrotesk_500Medium',
  600: 'HankenGrotesk_600SemiBold',
} as const;
export const mono = {
  400: 'GeistMono_400Regular',
  500: 'GeistMono_500Medium',
  italic: 'GeistMono_400Regular_Italic',
} as const;

/** Side gutter, and the fixed lanes that start or end list rows. */
export const GUTTER = 24;
export const lane = {
  /** Quantities and meal types. */
  label: 92,
  kcal: 64,
  /** Step and index numbers. */
  number: 36,
  checkbox: 32,
  arrow: 20,
} as const;

type Role = TextStyle & { color: ColorName };

/** A type role: tracking is given in em, as in the design, and converted to px here. */
function role(
  fontFamily: string,
  fontSize: number,
  lineHeight: number,
  color: ColorName,
  tracking = 0,
  caps = false,
): Role {
  return {
    fontFamily,
    fontSize,
    lineHeight,
    color,
    ...(tracking ? { letterSpacing: tracking * fontSize } : {}),
    ...(caps ? { textTransform: 'uppercase' } : {}),
  };
}

export const type = {
  pageTitle: role(sans[500], 34, 40, 'ink', -0.02),
  indexTitle: role(sans[500], 26, 32, 'ink', -0.01),
  cookStep: role(sans[400], 25, 36, 'ink', -0.01),
  featureTitle: role(sans[500], 24, 30, 'ink', -0.01),
  /** Day names on the plan, and the per-serving figures. */
  dayName: role(sans[500], 20, 26, 'ink'),
  listTitle: role(sans[500], 18, 24, 'ink'),
  itemName: role(sans[500], 17, 22, 'ink'),
  /** Ledes, standfirsts and method steps. */
  body: role(sans[400], 17, 27, 'ink2'),
  /** Meal titles and meta values. */
  meal: role(sans[400], 16, 22, 'ink'),
  subtitle: role(sans[400], 16, 24, 'ink2'),
  note: role(sans[400], 15, 23, 'ink2'),
  indexSub: role(sans[400], 15, 22, 'ink3'),
  secondary: role(sans[400], 14, 20, 'ink3'),
  quantity: role(mono[400], 14, 22, 'ink2'),
  heading: role(mono[500], 13, 16, 'ink', 0.02, true),
  button: role(mono[500], 13, 16, 'onAccent', 0.04, true),
  dayTotal: role(mono[500], 13, 16, 'ink', 0.02),
  mealKcal: role(mono[400], 13, 16, 'ink2'),
  label: role(mono[400], 12, 16, 'ink3', 0.02, true),
  /** Chip text: a label that keeps its case. */
  chip: role(mono[400], 12, 16, 'ink3', 0.02),
  stepNumber: role(mono[400], 12, 27, 'accent'),
  tag: role(mono[400], 11, 14, 'ink3', 0.04, true),
  arrow: role(mono[400], 18, 22, 'ink3'),
} satisfies Record<string, Role>;
export type TypeRole = keyof typeof type;

/**
 * An underline for ingredient terms and text actions. The offset only applies on web;
 * React Native can't move an underline on iOS.
 */
export function underline(style: 'dotted' | 'solid', offset: number): TextStyle {
  return {
    textDecorationLine: 'underline',
    textDecorationStyle: style,
    ...(Platform.OS === 'web' ? ({ textUnderlineOffset: offset, textDecorationThickness: 1 } as TextStyle) : {}),
  };
}
