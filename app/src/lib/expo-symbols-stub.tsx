// Android stand-in for expo-symbols (metro.config.js, docs/DECISIONS.md #618): the real package would bring
// the 970 KB Material Symbols font into the APK and every update, only because expo-router's NativeTabs code
// can reach it. The app uses neither NativeTabs nor SymbolView, so nothing here is ever shown; if a future
// screen does use them, the icon fails loudly instead of the font coming back unnoticed.

export function SymbolView(): null {
  return null;
}

export function unstable_getMaterialSymbolSourceAsync(): Promise<never> {
  return Promise.reject(new Error('expo-symbols is left out of the Android app (metro.config.js).'));
}
