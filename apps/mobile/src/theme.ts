import { createContext, useContext } from "react";
import { Platform, useColorScheme, type TextStyle } from "react-native";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono/400Regular";
import { GeistMono_400Regular_Italic } from "@expo-google-fonts/geist-mono/400Regular_Italic";
import { GeistMono_500Medium } from "@expo-google-fonts/geist-mono/500Medium";
import { HankenGrotesk_400Regular } from "@expo-google-fonts/hanken-grotesk/400Regular";
import { HankenGrotesk_500Medium } from "@expo-google-fonts/hanken-grotesk/500Medium";
import { HankenGrotesk_600SemiBold } from "@expo-google-fonts/hanken-grotesk/600SemiBold";

// Tokens, type roles and layout constants from design/README.md. Values are exact; don't round them.

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
  c: Omit<Colors, "accentFill" | "onAccent" | "accentTint"> & Partial<Pick<Colors, "accentFill" | "onAccent">>,
): Colors {
  return { accentFill: c.accent, onAccent: c.bg, ...c, accentTint: `${c.accent}17` };
}

/**
 * The colour palettes a person can pick from, each with a light and a dark set. Clay is the
 * original design and the default. To add one, add an entry here; the picker lists them in
 * this order.
 */
export const palettes = {
  Clay: {
    description: "Terracotta on warm paper",
    light: colors({
      bg: "#faf9f5",
      bgRaised: "#f1efe8",
      ink: "#141413",
      ink2: "#4c4b45",
      ink3: "#7b7a72",
      line: "#1414131c",
      accent: "#c15f3c",
    }),
    dark: colors({
      bg: "#141413",
      bgRaised: "#22211f",
      ink: "#faf9f5",
      ink2: "#b0aea5",
      ink3: "#87867f",
      line: "#faf9f51c",
      accent: "#d97757",
    }),
  },
  Basil: {
    description: "Herb green on pale sage",
    light: colors({
      bg: "#f5f7f2",
      bgRaised: "#ebefe7",
      ink: "#142019",
      ink2: "#46524a",
      ink3: "#6b7770",
      line: "#1420191f",
      accent: "#2f6b3f",
    }),
    dark: colors({
      bg: "#0e1410",
      bgRaised: "#18201a",
      ink: "#ecf1ea",
      ink2: "#b3bdb5",
      ink3: "#85908a",
      line: "#ecf1ea1f",
      accent: "#8cc59a",
    }),
  },
  Cobalt: {
    description: "Ink blue on white",
    light: colors({
      bg: "#ffffff",
      bgRaised: "#f2f3f6",
      ink: "#0d0f14",
      ink2: "#444852",
      ink3: "#6e727c",
      line: "#0d0f141a",
      accent: "#2341e0",
    }),
    dark: colors({
      bg: "#0a0b0f",
      bgRaised: "#16181e",
      ink: "#f3f4f7",
      ink2: "#b4b8c2",
      ink3: "#868a94",
      line: "#f3f4f71f",
      accent: "#6f86ff",
    }),
  },
  Yolk: {
    description: "Chrome yellow on white",
    light: colors({
      bg: "#ffffff",
      bgRaised: "#f3f3f1",
      ink: "#111111",
      ink2: "#444444",
      ink3: "#707070",
      line: "#1111111a",
      // Yellow can't be read on white, so accent text is a dark ochre and the yellow is fill only.
      accent: "#8a6400",
      accentFill: "#ffc72c",
      onAccent: "#111111",
    }),
    dark: colors({
      bg: "#111111",
      bgRaised: "#1d1d1d",
      ink: "#f5f5f2",
      ink2: "#b5b5b0",
      ink3: "#888888",
      line: "#ffffff1c",
      accent: "#ffc72c",
    }),
  },
  Beetroot: {
    description: "Deep beet on blush white",
    light: colors({
      bg: "#fbf9fa",
      bgRaised: "#f3eff1",
      ink: "#1a1418",
      ink2: "#4f454b",
      ink3: "#7a6f75",
      line: "#1a14181c",
      accent: "#9e1f55",
    }),
    dark: colors({
      bg: "#151013",
      bgRaised: "#211a1e",
      ink: "#f6eff3",
      ink2: "#bdb1b8",
      ink3: "#8d8189",
      line: "#f6eff31f",
      accent: "#ee6fa3",
    }),
  },
} satisfies Record<string, { description: string; light: Colors; dark: Colors }>;
export type PaletteName = keyof typeof palettes;
export const paletteNames = Object.keys(palettes) as PaletteName[];

/** "system" follows the phone; "light" and "dark" pin it. */
export type Mode = "system" | "light" | "dark";
export type Scheme = "light" | "dark";
export type Appearance = { palette: PaletteName; mode: Mode };
export const defaultAppearance: Appearance = { palette: "Clay", mode: "system" };

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
  return mode === "system" ? (system === "dark" ? "dark" : "light") : mode;
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
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
};

export const sans = {
  400: "HankenGrotesk_400Regular",
  500: "HankenGrotesk_500Medium",
  600: "HankenGrotesk_600SemiBold",
} as const;
export const mono = {
  400: "GeistMono_400Regular",
  500: "GeistMono_500Medium",
  italic: "GeistMono_400Regular_Italic",
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
    ...(caps ? { textTransform: "uppercase" } : {}),
  };
}

export const type = {
  pageTitle: role(sans[500], 34, 40, "ink", -0.02),
  indexTitle: role(sans[500], 26, 32, "ink", -0.01),
  cookStep: role(sans[400], 25, 36, "ink", -0.01),
  featureTitle: role(sans[500], 24, 30, "ink", -0.01),
  /** Day names on the plan, and the per-serving figures. */
  dayName: role(sans[500], 20, 26, "ink"),
  listTitle: role(sans[500], 18, 24, "ink"),
  itemName: role(sans[500], 17, 22, "ink"),
  /** Ledes, standfirsts and method steps. */
  body: role(sans[400], 17, 27, "ink2"),
  /** Meal titles and meta values. */
  meal: role(sans[400], 16, 22, "ink"),
  subtitle: role(sans[400], 16, 24, "ink2"),
  note: role(sans[400], 15, 23, "ink2"),
  indexSub: role(sans[400], 15, 22, "ink3"),
  secondary: role(sans[400], 14, 20, "ink3"),
  quantity: role(mono[400], 14, 22, "ink2"),
  heading: role(mono[500], 13, 16, "ink", 0.02, true),
  button: role(mono[500], 13, 16, "onAccent", 0.04, true),
  dayTotal: role(mono[500], 13, 16, "ink", 0.02),
  mealKcal: role(mono[400], 13, 16, "ink2"),
  label: role(mono[400], 12, 16, "ink3", 0.02, true),
  /** Chip text: a label that keeps its case. */
  chip: role(mono[400], 12, 16, "ink3", 0.02),
  stepNumber: role(mono[400], 12, 27, "accent"),
  tag: role(mono[400], 11, 14, "ink3", 0.04, true),
  arrow: role(mono[400], 18, 22, "ink3"),
} satisfies Record<string, Role>;
export type TypeRole = keyof typeof type;

/**
 * An underline for ingredient terms and text actions. The offset only applies on web;
 * React Native can't move an underline on iOS.
 */
export function underline(style: "dotted" | "solid", offset: number): TextStyle {
  return {
    textDecorationLine: "underline",
    textDecorationStyle: style,
    ...(Platform.OS === "web"
      ? ({ textUnderlineOffset: offset, textDecorationThickness: 1 } as TextStyle)
      : {}),
  };
}
