// Stand-in for react-native in the unit tests: only Platform.OS, set by a test through
// globalThis.__testOS ('web', 'android' or 'ios').

export const Platform = {
  get OS() {
    return globalThis.__testOS ?? 'web';
  },
};
