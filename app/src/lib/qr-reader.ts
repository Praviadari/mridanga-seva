// QR reading needs no set-up on phones: expo-camera reads codes with the phone's own scanner. The
// web version uses ./qr-reader.web.ts.

/** Nothing to prepare on a phone. */
export async function prepareQrReader(): Promise<void> {}
