// QR reading in the browser (docs/DECISIONS.md #143). Where the browser has no built-in barcode
// reader (desktop Chrome on Windows, Firefox, Safari), expo-camera loads the barcode-detector
// package, which runs zxing-wasm, a WebAssembly reader. By itself zxing-wasm downloads that file
// from the jsDelivr CDN, unchecked, into the page that holds the staff's sessions. Here it is told
// to take the copy the site serves instead: scripts/export-web.mjs copies
// node_modules/zxing-wasm/dist/reader/zxing_reader.wasm to dist/zxing/<version>/ after checking
// its SHA-256 against the one barcode-detector was published with. The site's CSP
// (app/public/_headers) allows no other host, so a CDN copy could not load anyway.
//
// barcode-detector comes with expo-camera, it is not a dependency of its own: this file imports
// it by the same name as expo-camera does, so both share one copy. In development (`npx expo
// start`) nothing is changed: the dev server has no dist/zxing folder, so the CDN copy is used.

let prepared: Promise<void> | null = null;

/** Points zxing-wasm at the site's own copy of its reader. Safe to call more than once; never throws. */
export function prepareQrReader(): Promise<void> {
  if (__DEV__) return Promise.resolve();
  prepared ??= import('barcode-detector')
    .then(({ setZXingModuleOverrides, ZXING_WASM_VERSION }) => {
      setZXingModuleOverrides({
        locateFile: (path: string, prefix: string) =>
          path.endsWith('.wasm') ? `/zxing/${ZXING_WASM_VERSION}/${path}` : prefix + path,
      });
    })
    .catch(() => {
      // The scanner then reports that the camera cannot read codes; nothing else depends on it.
    });
  return prepared;
}
