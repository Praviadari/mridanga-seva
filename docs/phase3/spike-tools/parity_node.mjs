// Step 2 of the parity check: the app's own face-math.ts makes the SFace and MiniFASNet inputs.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [, , base, mathPath] = process.argv;
const m = await import(pathToFileURL(mathPath).href);
const meta = JSON.parse(readFileSync(`${base}/parity/meta.json`, 'utf8'));
for (const [name, info] of Object.entries(meta)) {
  const data = new Uint8Array(readFileSync(`${base}/parity/${name}.rgba`));
  const img = { data, width: info.w, height: info.h, stride: info.w * 4, layout: 'RGBA' };
  const t0 = performance.now();
  const sface = m.alignedFaceTensor(img, info.points, 'nhwc');
  const t1 = performance.now();
  const fas27 = m.antiSpoofTensor(img, info.box, 2.7, 'nhwc');
  const fas40 = m.antiSpoofTensor(img, info.box, 4.0, 'nhwc');
  const t2 = performance.now();
  writeFileSync(`${base}/parity/${name}_sface_in.f32`, Buffer.from(sface.buffer));
  writeFileSync(`${base}/parity/${name}_fas27_in.f32`, Buffer.from(fas27.buffer));
  writeFileSync(`${base}/parity/${name}_fas40_in.f32`, Buffer.from(fas40.buffer));
  console.log(name, 'align ms', (t1 - t0).toFixed(1), 'fas crops ms', (t2 - t1).toFixed(1));
}
