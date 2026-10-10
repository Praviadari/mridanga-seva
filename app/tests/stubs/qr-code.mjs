// Stand-in for src/components/qr-code.tsx in the unit tests (no react-native-svg in plain Node): a fixed
// one-module shape, enough for the sheet builders' layout.

/** Same shape as the real qrShape's answer. */
export function qrShape() {
  return { path: 'M4 4h1v1h-1z', modules: 21, quietZone: 4 };
}
