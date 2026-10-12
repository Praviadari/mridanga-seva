# Face spike models (branch p3-spike only — never merged)

Converted on 12-10-2026 for the Phase 3 native spike (docs/phase3/SPIKE_RESULT.md). All three run on the
phone with react-native-fast-tflite (LiteRT 1.4.0, CPU). Weights are int8 ("dynamic range": int8 weights,
float maths); inputs and outputs stay float32.

| File | From | Licence | Input | Output |
|---|---|---|---|---|
| `sface_2021dec_int8.tflite` (9.9 MB) | OpenCV Zoo `face_recognition_sface_2021dec.onnx`, sha256 0ba9fbfa…4e79 | Apache 2.0 (OpenCV Zoo model directory) | 1x112x112x3, RGB 0..255, face aligned to the ArcFace 5-point template | 1x128 embedding (compare by cosine) |
| `minifasnet_v2_2_7_int8.tflite` (0.6 MB) | minivision-ai/Silent-Face-Anti-Spoofing `2.7_80x80_MiniFASNetV2.pth`, sha256 a5eb02e1…bec0 | Apache 2.0 (upstream LICENSE) | 1x80x80x3, BGR 0..255, face box x2.7 | 1x3 softmax, index 1 = real |
| `minifasnet_v1se_4_0_int8.tflite` (0.6 MB) | same repo, `4_0_0_80x80_MiniFASNetV1SE.pth`, sha256 84ee1d37…5990 | Apache 2.0 | same, face box x4.0 | same |

sha256 of the files here: sface f7b7785a…a80f, v2 1a2e3244…9f91, v1se 948a1f87…8654.

How they were made (scripts in docs/phase3/spike-tools/): SFace ONNX → onnxsim → onnx2tf 1.28.8 (TF 2.21)
→ TFLiteConverter with Optimize.DEFAULT; MiniFASNet .pth → PyTorch 2.14 ONNX export with softmax appended →
same path. Parity on four public-domain portraits: the app's own `src/spike/face-math.ts` + these files gave
embeddings with cosine ≥ 0.999 to OpenCV's FaceRecognizerSF (alignCrop + feature on the original ONNX).

Open licence question (MODEL_OPTIONS.md §6, LAWYER_PACK): SFace's training data (CASIA-WebFace / VGGFace2 /
MS-Celeb-1M per the paper) is not named on the model card.
