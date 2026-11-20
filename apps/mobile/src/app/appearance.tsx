import { AppearanceSettings } from "../appearance";
import { BackLink, Gutter, PageHead, Screen, TopBar } from "../primitives";

/** Mode and colour palette. Settings screens link here; the choice applies as soon as it's tapped. */
export default function AppearanceScreen() {
  return (
    <Screen>
      <TopBar left={<BackLink label="Home" />} />
      <PageHead title="Appearance" lede="Changes apply straight away and stay on this phone." />
      <Gutter>
        <AppearanceSettings />
      </Gutter>
    </Screen>
  );
}
