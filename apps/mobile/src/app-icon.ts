import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { defaultPalette, type PaletteName } from './palettes';

// The Home Screen icon follows the chosen palette. Each palette's icon is built into the app by
// scripts/icons.ts and expo-alternate-app-icons; iOS picks its light, dark or tinted file itself.

/** The native half of expo-alternate-app-icons. */
type AppIcons = {
  supportsAlternateIcons: boolean;
  getAppIconName(): string | null;
  setAlternateAppIcon(name: string | null): Promise<string | null>;
};

// Looked up optionally because the library's own entry throws where the module isn't built in,
// such as Expo Go. Icons are only set up for iOS.
const icons = Platform.OS === 'ios' ? requireOptionalNativeModule<AppIcons>('ExpoAlternateAppIcons') : null;

/**
 * Switches the Home Screen icon to the palette's, unless it already shows it. iOS announces every
 * switch with an alert, so this only calls through when the icon is wrong. A failed switch is
 * left alone: the icon is cosmetic, and the next palette change or launch tries again. One switch
 * runs at a time; a palette picked meanwhile is matched once it settles.
 */
export function matchAppIcon(palette: PaletteName) {
  latest = palette;
  if (switching || !icons?.supportsAlternateIcons) return;
  // The default palette's icon is the primary icon, which iOS names null.
  const name = palette === defaultPalette ? null : palette;
  if (icons.getAppIconName() === name) return;
  switching = true;
  icons
    .setAlternateAppIcon(name)
    .catch(() => {})
    .finally(() => {
      switching = false;
      if (latest !== palette) matchAppIcon(latest);
    });
}
let switching = false;
let latest: PaletteName = defaultPalette;
