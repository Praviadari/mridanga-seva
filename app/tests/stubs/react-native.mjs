// Stand-in for react-native in the unit tests: Platform.OS, set by a test through globalThis.__testOS ('web',
// 'android' or 'ios'), and an AppState that never changes (src/lib/offline-send.ts listens to it).

export const Platform = {
  get OS() {
    return globalThis.__testOS ?? 'web';
  },
};

export const AppState = {
  currentState: 'active',
  addEventListener: () => ({ remove: () => undefined }),
};
