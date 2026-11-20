import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance as RNAppearance, Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SectionHeader, Text, WEB } from './primitives';
import {
  AppearanceContext,
  defaultAppearance,
  lane,
  paletteNames,
  palettes,
  useAppearance,
  useColors,
  type Appearance,
  type Mode,
  type PaletteName,
} from './theme';

// The colour palette and light/dark mode a person picks. The choice is kept on this device
// and applied everywhere through `useColors()`. Settings screens drop in `AppearanceSettings`,
// or `ModePicker` and `PalettePicker` on their own.

const key = 'feedr.appearance.v1';
const modes: Mode[] = ['system', 'light', 'dark'];

/** Reads a saved choice, falling back to the default for anything missing or unknown. */
function parse(saved: string | null): Appearance {
  try {
    const value = JSON.parse(saved ?? '{}') as Partial<Record<keyof Appearance, unknown>>;
    return {
      palette: paletteNames.find((name) => name === value.palette) ?? defaultAppearance.palette,
      mode: modes.find((mode) => mode === value.mode) ?? defaultAppearance.mode,
    };
  } catch {
    return defaultAppearance;
  }
}

/**
 * Loads the saved appearance and provides it to `useColors()`. `onReady` fires once it's loaded,
 * so the root layout can hold the splash screen and never flash the default palette.
 */
export function AppearanceProvider({ children, onReady }: { children: ReactNode; onReady?: () => void }) {
  const [appearance, setAppearance] = useState<Appearance | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(key)
      .catch(() => null)
      .then((saved) => setAppearance(parse(saved)));
  }, []);
  useEffect(() => {
    if (appearance) onReady?.();
  }, [appearance, onReady]);
  // On iOS and Android, pin the native scheme too, so keyboards and alerts match the app.
  const mode = appearance?.mode;
  useEffect(() => {
    if (mode && !WEB) RNAppearance.setColorScheme(mode === 'system' ? 'auto' : mode);
  }, [mode]);

  const value = useMemo(() => {
    const current = appearance ?? defaultAppearance;
    const save = (next: Appearance) => {
      setAppearance(next);
      void AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
    };
    return {
      ...current,
      setPalette: (palette: PaletteName) => save({ ...current, palette }),
      setMode: (mode: Mode) => save({ ...current, mode }),
    };
  }, [appearance]);

  if (!appearance) return null;
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

/** System, Light and Dark in one outlined strip; the chosen one is filled ink. */
export function ModePicker() {
  const colors = useColors();
  const { mode, setMode } = useAppearance();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Mode"
      style={{ flexDirection: 'row', borderWidth: 1, borderColor: colors.line }}
    >
      {modes.map((option, i) => {
        const on = option === mode;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={`${modeLabel[option]} appearance`}
            aria-checked={on}
            onPress={() => setMode(option)}
            style={{
              flex: 1,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? colors.ink : 'transparent',
              ...(i ? { borderLeftWidth: 1, borderLeftColor: colors.line } : {}),
            }}
          >
            <Text variant="label" color={on ? 'bg' : 'ink2'}>
              {modeLabel[option]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const modeLabel: Record<Mode, string> = { system: 'System', light: 'Light', dark: 'Dark' };

/**
 * A palette's light and dark sets side by side: each half is that set's background with its
 * accent square, so the swatch reads like a tiny Home screen in both modes.
 */
export function PaletteSwatch({ palette }: { palette: PaletteName }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', width: swatchWidth, height: 32, borderWidth: 1, borderColor: colors.line }}>
      {(['light', 'dark'] as const).map((scheme) => (
        <View
          key={scheme}
          style={{
            flex: 1,
            backgroundColor: palettes[palette][scheme].bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ width: 10, height: 10, backgroundColor: palettes[palette][scheme].accentFill }} />
        </View>
      ))}
    </View>
  );
}
const swatchWidth = 52;

/**
 * One row per palette: swatch, name and a short description, and a square marker on the
 * chosen one. Picking a row recolours the whole app straight away, so the screen it sits on
 * is the preview.
 */
export function PalettePicker() {
  const colors = useColors();
  const { palette, setPalette } = useAppearance();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Colour">
      {paletteNames.map((name, i) => {
        const on = name === palette;
        return (
          <Pressable
            key={name}
            accessibilityRole="radio"
            accessibilityLabel={`${name}: ${palettes[name].description}`}
            aria-checked={on}
            onPress={() => setPalette(name)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
              paddingVertical: 14,
              borderTopWidth: 1,
              borderTopColor: colors.line,
              ...(i === paletteNames.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.line } : {}),
            }}
          >
            <PaletteSwatch palette={name} />
            <View style={{ flex: 1, gap: 1 }}>
              <Text variant="itemName">{name}</Text>
              <Text variant="secondary">{palettes[name].description}</Text>
            </View>
            <View style={{ width: lane.arrow, flexShrink: 0, alignItems: 'flex-end' }}>
              <View
                style={{
                  width: 14,
                  height: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: on ? colors.accent : colors.ink3,
                }}
              >
                {on && <View style={{ width: 8, height: 8, backgroundColor: colors.accent }} />}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Mode and palette under mono section headings: the whole Appearance block for a settings screen. */
export function AppearanceSettings() {
  const { palette, mode } = useAppearance();
  return (
    <View style={{ gap: 32 }}>
      <View>
        <SectionHeader title="Mode" meta={mode === 'system' ? 'Follows your phone' : undefined} gap={14} />
        <ModePicker />
      </View>
      <View>
        <SectionHeader title="Colour" meta={palette} gap={14} />
        <PalettePicker />
      </View>
    </View>
  );
}
