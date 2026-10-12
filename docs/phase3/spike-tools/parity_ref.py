# Step 1 of the parity check: YuNet landmarks + OpenCV FaceRecognizerSF reference embeddings, and raw RGBA dumps
# for the app's own face-math.ts (run by parity_node.mjs).
import cv2, json, os, sys, numpy as np
base = sys.argv[1]; faces = os.path.join(base, 'faces'); out = os.path.join(base, 'parity'); os.makedirs(out, exist_ok=True)
models = os.path.join(base, 'models')
rec = cv2.FaceRecognizerSF.create(os.path.join(models, 'sface.onnx'), '')
meta = {}
for f in sorted(os.listdir(faces)):
    img = cv2.imread(os.path.join(faces, f)); h, w = img.shape[:2]
    det = cv2.FaceDetectorYN.create(os.path.join(models, 'yunet.onnx'), '', (w, h), 0.8)
    _, fs = det.detect(img)
    face = fs[0]
    aligned = rec.alignCrop(img, face)
    ref = rec.feature(aligned).flatten()
    name = os.path.splitext(f)[0]
    rgba = cv2.cvtColor(img, cv2.COLOR_BGR2RGBA)
    rgba.tofile(os.path.join(out, name + '.rgba'))
    np.save(os.path.join(out, name + '_ref.npy'), ref)
    np.save(os.path.join(out, name + '_aligned_bgr.npy'), aligned)
    p = face[4:14].reshape(5, 2)
    # YuNet order: right eye, left eye, nose tip, right mouth corner, left mouth corner (the person's own sides)
    meta[name] = dict(w=w, h=h, box=dict(x=float(face[0]), y=float(face[1]), width=float(face[2]), height=float(face[3])),
        points=dict(rightEye=dict(x=float(p[0,0]), y=float(p[0,1])), leftEye=dict(x=float(p[1,0]), y=float(p[1,1])),
                    nose=dict(x=float(p[2,0]), y=float(p[2,1])), mouthRight=dict(x=float(p[3,0]), y=float(p[3,1])),
                    mouthLeft=dict(x=float(p[4,0]), y=float(p[4,1]))))
json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'), indent=1)
print(json.dumps({k: (v['w'], v['h']) for k, v in meta.items()}))
