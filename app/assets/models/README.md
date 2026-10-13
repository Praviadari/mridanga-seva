# Face scan models (Phase 3, branch p3-native)

The three on-device models of the face scan (docs/DECISIONS.md #307; chosen by the P3-0 spike,
docs/phase3/SPIKE_RESULT.md on branch `p3-spike`, §3-§4). They run on the phone with
react-native-fast-tflite 3.0.1 (LiteRT 1.4.0, CPU only: the GPU delegate library is left out of the APK by
app.json `packagingOptions`). Weights are int8 ("dynamic range": int8 weights, float maths); inputs and outputs
stay float32. Nothing here is a face of anyone: these are the generic models, the same for every phone.

| File | Bytes | SHA-256 | From | Licence | Input | Output |
|---|---|---|---|---|---|---|
| `sface_2021dec_int8.tflite` | 9,870,200 | `f7b7785abab94f528830f8d2e4550d50d794e3e15dcf7e2f1ca43ffbe025a80f` | OpenCV Zoo `face_recognition_sface_2021dec.onnx` (sha256 0ba9fbfa…4e79) | Apache 2.0 (OpenCV Zoo model directory) | 1x112x112x3, RGB 0..255, face aligned to the ArcFace 5-point template | 1x128 embedding (compared by cosine) |
| `minifasnet_v2_2_7_int8.tflite` | 586,512 | `1a2e32446bbbe08423c3a44735e274b05821f7168f9fe6926adfab52199b9f91` | minivision-ai/Silent-Face-Anti-Spoofing `2.7_80x80_MiniFASNetV2.pth` (sha256 a5eb02e1…bec0) | Apache 2.0 (upstream LICENSE, read 12-10-2026) | 1x80x80x3, BGR 0..255, face box x2.7 | 1x3 softmax, index 1 = real face |
| `minifasnet_v1se_4_0_int8.tflite` | 586,368 | `948a1f8724d2391f5ada925ffa2b3ab7239773e77e5355acd53be0a0847f8654` | same repository, `4_0_0_80x80_MiniFASNetV1SE.pth` (sha256 84ee1d37…5990) | Apache 2.0 | same, face box x4.0 | same; the two scores are averaged as upstream does |

The files are byte-identical to the spike's (`git rev-parse origin/p3-spike:app/assets/models/<file>` gives the
same blobs). Check them with PowerShell `Get-FileHash <file> -Algorithm SHA256`.

**Model version on the server:** setting `face_model_version` = `sface-2021dec-int8` (migration 0060, #300);
the app's `FACE_MODEL_VERSION` (src/face/face-settings.ts) must be the same text. A new model = a new version
text on both sides; the server then ends every enrolment made with the old one (model_changed) and phones
wipe their face codes at the next start.

**How they were made** (scripts in docs/phase3/spike-tools/ on branch `p3-spike`): SFace ONNX → onnxsim →
onnx2tf 1.28.8 (TF 2.21) → TFLiteConverter with Optimize.DEFAULT; MiniFASNet .pth → PyTorch 2.14 ONNX export
with softmax appended → same path. Parity on four public-domain portraits: the app's own face-math
(src/face/face-math.ts, unchanged from the spike) + these files gave embeddings with cosine ≥ 0.999 to OpenCV's
FaceRecognizerSF (alignCrop + feature on the original ONNX).

**Open licence question** (MODEL_OPTIONS.md §6, LAWYER_PACK): SFace's training data (CASIA-WebFace / VGGFace2 /
MS-Celeb-1M per the paper) is not named on the model card.
