# Step 3: run the TFLite models on face-math.ts inputs and compare with OpenCV's FaceRecognizerSF (ONNX) and
# the PyTorch-exported MiniFASNet (ONNX) on the upstream-style crop.
import json, os, sys, numpy as np, cv2, onnxruntime as ort
from ai_edge_litert.interpreter import Interpreter
base = sys.argv[1]; P = os.path.join(base, 'parity'); M = os.path.join(base, 'models')
meta = json.load(open(os.path.join(P, 'meta.json')))
def run(path, x):
    it = Interpreter(model_path=path); it.allocate_tensors()
    i = it.get_input_details()[0]; o = it.get_output_details()[0]
    it.set_tensor(i['index'], x.reshape(i['shape']).astype(np.float32)); it.invoke()
    return it.get_tensor(o['index']).flatten(), list(i['shape'])
def cos(a, b): return float(np.dot(a, b) / np.linalg.norm(a) / np.linalg.norm(b))
variants = {'fp32': 'out_sface/sface_sim_float32.tflite', 'fp16': 'out_sface/sface_sim_float16.tflite', 'int8dyn': 'sface_dynint8.tflite'}
names = sorted(meta); embs = {v: {} for v in variants}; ref = {n: np.load(os.path.join(P, n + '_ref.npy')) for n in names}
for n in names:
    x = np.fromfile(os.path.join(P, n + '_sface_in.f32'), dtype=np.float32)
    for v, path in variants.items():
        e, shape = run(os.path.join(M, path), x); embs[v][n] = e
    print(n, 'input', shape, ' cos(app pipeline+TFLite, OpenCV ref):', {v: round(cos(embs[v][n], ref[n]), 4) for v in variants})
pairs = [(a, b) for i, a in enumerate(names) for b in names[i+1:]]
print('pair scores (same person = a1/a2):')
for a, b in pairs:
    print(f'  {a}-{b}  ref {cos(ref[a], ref[b]):.3f}  ' + '  '.join(f'{v} {cos(embs[v][a], embs[v][b]):.3f}' for v in variants))
# MiniFASNet
def up_crop(img, box, scale):
    src_h, src_w = img.shape[:2]; x, y, bw, bh = box
    scale = min((src_h-1)/bh, min((src_w-1)/bw, scale)); nw, nh = bw*scale, bh*scale; cx, cy = bw/2+x, bh/2+y
    l, t, r, b = cx-nw/2, cy-nh/2, cx+nw/2, cy+nh/2
    if l < 0: r -= l; l = 0
    if t < 0: b -= t; t = 0
    if r > src_w-1: l -= r-src_w+1; r = src_w-1
    if b > src_h-1: t -= b-src_h+1; b = src_h-1
    return cv2.resize(img[int(t):int(b)+1, int(l):int(r)+1], (80, 80))
fas = {2.7: ('minifasnet_v2_2_7', 'fas27'), 4.0: ('minifasnet_v1se_4_0', 'fas40')}
for n in names:
    img = cv2.imread(os.path.join(base, 'faces', n + '.jpg')); bx = meta[n]['box']; box = (bx['x'], bx['y'], bx['width'], bx['height'])
    row = []
    for scale, (mname, tag) in fas.items():
        crop = up_crop(img, box, scale).astype(np.float32)
        refp = ort.InferenceSession(os.path.join(M, mname + '.onnx')).run(None, {'input': crop.transpose(2, 0, 1)[None]})[0].flatten()
        appin = np.fromfile(os.path.join(P, f'{n}_{tag}_in.f32'), dtype=np.float32)
        diff = float(np.abs(appin - crop.reshape(-1)).mean())
        t32, _ = run(os.path.join(M, f'out_{mname}/{mname}_float32.tflite'), appin)
        t8, shape = run(os.path.join(M, f'{mname}_dynint8.tflite'), appin)
        row.append(f'{tag}: input diff {diff:.2f}/255, real ref {refp[1]:.3f} tfl32 {t32[1]:.3f} int8 {t8[1]:.3f} {shape}')
    print(n, ' | '.join(row))
