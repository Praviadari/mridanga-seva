// The bytes of a file bundled with the app (a require()d asset), on Android and iOS: expo-asset copies it to the
// phone's storage on first use, expo-file-system reads it. For the recorded khol strokes (lib/khol-samples.ts).
// The browser version is asset-bytes.web.ts.

import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

/** The file's bytes. Throws when it cannot be read. */
export async function assetBytes(module: number): Promise<Uint8Array> {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  return new Uint8Array(await new File(asset.localUri ?? asset.uri).arrayBuffer());
}
