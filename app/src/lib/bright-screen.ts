// Full brightness while My QR is in view (docs/DECISIONS.md #800): the coordinator's scanner reads a bright code
// faster in a sunny doorway or a dim hall. Only this app's window is brightened (expo-brightness setBrightnessAsync),
// never the phone's own setting, so no WRITE_SETTINGS permission (app.json blocks it; the module's config plugin, which
// would add it, is not listed). Leaving the screen hands the window back to the phone's brightness. The web has its
// own file (./bright-screen.web.ts): a browser page cannot change the screen's brightness.

import * as Brightness from 'expo-brightness';
import { Platform } from 'react-native';

/** Turns this app's window to full brightness. Resolves to an undo that puts the earlier brightness back. */
export async function brightenScreen(): Promise<() => void> {
  try {
    // iOS keeps a set brightness until the phone locks, so it needs the earlier value; Android only stops overriding.
    const before = Platform.OS === 'ios' ? await Brightness.getBrightnessAsync() : null;
    await Brightness.setBrightnessAsync(1);
    return () => {
      const undo = before === null ? Brightness.restoreSystemBrightnessAsync() : Brightness.setBrightnessAsync(before);
      undo.catch(() => undefined);
    };
  } catch {
    return () => undefined; // no window to brighten (the app is going to the background): the code still shows
  }
}
