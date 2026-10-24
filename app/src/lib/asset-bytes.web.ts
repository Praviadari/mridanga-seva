// The bytes of a file bundled with the app, in the browser: fetched from the site like any of its files
// (asset-bytes.ts is the phone version).

import { Asset } from 'expo-asset';

/** The file's bytes. Throws when it cannot be read. */
export async function assetBytes(module: number): Promise<Uint8Array> {
  const response = await fetch(Asset.fromModule(module).uri);
  if (!response.ok) throw new Error(`asset ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
