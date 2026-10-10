# Phase 3 — Face recognition model options (DRAFT, 09-10-2026)

> **UPDATE 10-10-2026 (DECISIONS #248):** only **1:1** matching on the student's own phone is needed (no 1:N scanner, no tablet). The model choice (ML Kit + SFace + MiniFASNet, on device) is confirmed in the spike, P3-0 in [WORK_PLAN.md](WORK_PLAN.md).

**Status:** research only; no model was downloaded or tested. "Verified" = read on the cited page
on 09-10-2026. "Unverified" = from secondary sources or memory; check before relying on it.
Context: [FACE_ATTENDANCE_PLAN.md](FACE_ATTENDANCE_PLAN.md).

## 1. The pieces of a face check

1. **Detection** — find the face and its landmarks in a camera frame.
2. **Alignment + crop** — rotate/scale to the model's input (e.g. 112×112).
3. **Liveness** — is it a live face, not a photo or screen?
4. **Embedding** — a model turns the crop into a template (128-512 numbers).
5. **Matching** — cosine similarity against stored templates; a threshold decides.

Steps 1-5 can all run on the phone (on-device) or steps 3-5 on a server (send a face image).

## 2. On-device vs server

| | On-device | Server / cloud API |
|---|---|---|
| Face images leave the phone | **No** (only templates, encrypted) | **Yes**, every scan |
| Works offline | Yes (on the phone; self-scan is still refused offline by design, #248) | No |
| Per-scan cost | ₹0 | Per call (AWS ≈ $0.001/search + $0.015/liveness check, US prices) |
| Processor abroad (D4-12) | None new | AWS / Microsoft: US companies (servers may be in Mumbai); add to the processor register and notice |
| Accuracy | Lower than top commercial engines; must be calibrated by us | High, vendor-tested; still not tested on our students |
| Liveness | Open models of limited strength + supervision | Vendor liveness (AWS Face Liveness is strong, but web/native SDK flow) |
| Build effort | Higher (native frame pipeline, models, thresholds) | Lower on the phone; needs an Edge Function and keys |
| Licence risk | Model weights' licence + training-data provenance | Vendor terms (biometric clauses put consent/notice duties on us) |
| Fit with DPDP minimisation | Best | Weaker (images of children sent to a third party) |

**Recommendation: on-device**, for privacy (no child's face image leaves the device), zero running
cost, and no new processor abroad. Keep a cloud API only as Plan B if the
on-device spike fails.

## 3. Candidates

### 3.1 Detection

| Option | Licence / terms | Notes | Status |
|---|---|---|---|
| **Google ML Kit Face Detection** | Free, on-device; ML Kit terms | Bounding box, landmarks, eye-open probability (helps blink liveness). **Detection only, no recognition.** Via the vision-camera plugin `react-native-vision-camera-face-detector` | Verified (plugin exists, MLKit-based) |
| YuNet (OpenCV Zoo) | MIT (model directory) | Tiny detector (~0.3 MB, unverified size), ONNX | Licence verified on the zoo README |
| expo-face-detector | — | **Removed from Expo since SDK 51**; Expo recommends vision-camera | Verified (Expo docs) |

### 3.2 Embedding (recognition)

| Option | Licence of the **weights** | Size / accuracy | Notes | Verdict |
|---|---|---|---|---|
| **SFace (OpenCV Zoo `face_recognition_sface_2021dec`)** | **Apache 2.0** ("All files in this directory are licensed under Apache 2.0 License") — verified | MobileFaceNet architecture trained with SFace loss; zoo reports 0.9940 (fp32) / 0.9932 (int8) on its eval (benchmark not named on the page; LFW-type) | ONNX format → `onnxruntime-react-native` or convert to TFLite. **Training data of these weights not stated** on the model card; the SFace paper trained on CASIA-WebFace, VGGFace2 and MS-Celeb-1M — datasets with their own non-commercial/withdrawn status (unverified which one these weights used) | **First choice**, with the training-data question for the lawyer (§6) |
| MobileFaceNet (paper: Chen et al. 2018) weights from GitHub / Qualcomm AI Hub | Varies per repo; Qualcomm's HF repo is based on another implementation — licence of weights **not verified** | 4.0 MB, 99.55% LFW in the paper (trained on refined MS-Celeb-1M) | MS-Celeb-1M was withdrawn by Microsoft in 2019 (memory, verify) | Only if a clear licence is found |
| FaceNet variants (e.g. davidsandberg/facenet, keras-facenet) | Code MIT; weights trained on VGGFace2 / CASIA (dataset terms non-commercial — unverified) | 128-d/512-d, ~90 MB+ (too big without quantisation) | Older, heavier | No |
| **InsightFace** model packs (buffalo_l, buffalo_s, antelopev2, ArcFace R100…) | **Non-commercial research only** — code MIT, models not: "The pretrained models provided with this library are available for non-commercial research purposes only" (PyPI insightface page, verified via search) | Best open accuracy (R100@Glint360K) | A free seva app is still not "research"; Immich uses them only with the maintainer's explicit permission | **Not allowed** without a commercial licence from InsightFace |
| Commercial on-device SDKs (various vendors) | Paid licence | Vendor-tested, include liveness | Cost unknown; vendor due diligence | Plan B if open models fail |

### 3.3 Liveness

| Option | Licence | Notes | Verdict |
|---|---|---|---|
| **MiniFASNet** (Minivision "Silent-Face-Anti-Spoofing"), V2 + V1SE ensemble | **Apache 2.0 per third-party integrations — upstream LICENSE not verified** | ~1.7-2 MB each, 80×80 input; passive (no user action); weaker when the face is turned > 30° | First choice for passive; verify upstream licence |
| Active challenge (blink / turn head) using ML Kit eye-open and head-angle values | No model | Cheap and effective against photos; adds 1-2 s | Use for every self-scan (#248) |
| AWS Rekognition Face Liveness | AWS terms; available in **Asia Pacific (Mumbai)** among 5 regions (secondary source); $0.015/check US-East, billed pass or fail | Strong, but face video goes to AWS | Plan B |
| Azure Face liveness | Limited Access (gated separately) | See §3.4 | No |

### 3.4 Cloud APIs

| Service | Access | Data location | Cost (published, US) | Verdict |
|---|---|---|---|---|
| **AWS Rekognition** (IndexFaces, SearchFacesByImage, CompareFaces, Face Liveness) | Open to any AWS account | Choose ap-south-1 Mumbai (Rekognition there — unverified for every API); AWS is a US company → processor register (D4-12), DPA | Group 1 image APIs $0.0010/image first 1M; face vector storage $0.00001/month; Liveness $0.015/check; free tier 1,000 images/month for 12 months (AWS pricing page, verified 09-10-2026; region not stated for image prices) | Plan B. ~200 students × ~3 visits/week × 2 scans ≈ 5,000 searches/month ≈ **$5/month**; with liveness on every scan ≈ **+$75/month** |
| **Azure AI Face** (identify / verify) | **Limited Access**: only Microsoft-managed customers and partners, registration, Microsoft's sole discretion, approved use cases only; detection stays open | Region availability in Central India not found | — | **Not viable** for a small seva without a Microsoft account team |
| Indian vendors (KYC liveness/face-match APIs) | Commercial contracts | India | Per call | Not researched; would add a processor |

## 4. Integration path in our Expo app

Current app: Expo SDK 57, React Native 0.86, `expo-camera` for QR, `expo-location`, EAS builds,
`runtimeVersion` fingerprint policy (app.json).

1. **Dev build / APK** — vision-camera and model runtimes are native; not in Expo Go. We already
   ship our own APKs, so this is a new APK, not a new way of working.
2. **Camera:** `react-native-vision-camera` with **frame processors** (worklets). v5 uses Nitro
   Modules and `react-native-worklets`; `runAsync` for heavy work, `runAtTargetFps` to limit the
   rate (secondary 2026 guide — verify against the official docs for the version picked).
3. **Detection:** `react-native-vision-camera-face-detector` (ML Kit).
4. **Embedding + liveness:** `react-native-fast-tflite` (TFLite; needs `react-native-nitro-modules`,
   `tflite` in metro `assetExts`, Expo config plugin) **or** `onnxruntime-react-native` (ONNX, for
   SFace as shipped). Converting SFace ONNX → TFLite is possible but is a step to test.
5. **Matching:** plain JS (cosine similarity over ~200 × 128 floats is trivial).
6. **Expo SDK 57 / RN 0.86 support of each package: unverified** → the 1-week spike in Jan-Feb
   2027 (plan §8). Acceptance: detection + liveness + embedding + match < 500 ms on a budget
   Android phone; APK size growth measured; no crash on Android 10-15.

## 5. Accuracy on children and Indian faces

- **No public benchmark** of SFace, MobileFaceNet or MiniFASNet on Indian children was found.
- NIST FRVT Part 3: Demographic Effects (NISTIR 8280, Dec 2019; 189 algorithms, 18.27 M images):
  most algorithms show demographic differentials; in one-to-one matching Asian and African American
  faces had higher false positive rates than Caucasian faces in many algorithms. From memory
  (verify in the report's age sections): false matches are highest for the elderly and **children**,
  and the report's country-of-birth groups include South Asia. Small open models will likely do worse
  than the top NIST entries.
- Children's faces change quickly → re-enrol minors every 12 months (plan §6.3); consider a minimum
  age for face (DECISIONS_FOR_GURU #3).
- **Our own calibration is required:** in week 6, with consenting adult volunteers at the centre's
  real lighting, measure genuine and impostor scores and set the threshold for a false-accept rate
  around 1 in 10,000 per comparison (history: a 1:N search over 200 people, dropped by #248, would have had ≈ 1 in 50 chance of *some* wrong candidate
  per scan without a margin rule; 1:1 on the student's own phone compares with one template only).
  Siblings at the same class are the realistic hard
  case; record them during the pilot.

## 6. Licence checklist (for the lawyer / before the build)

1. SFace weights: Apache 2.0 for the files — does the training data's licence (CASIA-WebFace /
   VGGFace2 / MS-Celeb-1M: research-only or withdrawn) affect the use of weights trained on it in
   a free, non-profit app? (Unsettled law internationally; get an opinion.)
2. MiniFASNet: confirm the upstream LICENSE file.
3. ML Kit: Google's ML Kit terms (free; check data-sharing clauses for on-device APIs).
4. InsightFace: do not use the public packs; ask for a commercial licence only if accuracy forces it.
5. Any cloud API: DPA, data location, biometric clauses (customer must give notice, get consent,
   delete — Azure's wording, and similar in AWS service terms).

## Sources (read 09-10-2026 unless stated)

- InsightFace on PyPI (models non-commercial research only; code MIT) — https://pypi.org/project/insightface/
- InsightFace model zoo README — https://github.com/deepinsight/insightface/blob/master/model_zoo/README.md
- Immich ML README (InsightFace models used with maintainer permission) — https://github.com/immich-app/immich/blob/main/machine-learning/README.md
- OpenCV Zoo SFace (Apache 2.0, accuracy figures) — https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface
- OpenCV Zoo YuNet README (MIT) — https://huggingface.co/opencv/opencv_zoo/blob/d33294bfaec5f2386dab1783e1a4031330645f57/models/face_detection_yunet/README.md
- SFace paper, Zhong et al., arXiv 2205.12010 (TIP 2021) — https://arxiv.org/abs/2205.12010 ; code https://github.com/zhongyy/SFace
- MobileFaceNets paper, arXiv 1804.07573 — https://arxiv.org/abs/1804.07573 ; Qualcomm AI Hub MobileFaceNet — https://huggingface.co/qualcomm/MobileFaceNet
- Silent-Face-Anti-Spoofing (MiniFASNet) via third-party notes — https://github.com/suriAI/face-antispoof-onnx ; https://www.mintlify.com/shubham0204/OnDevice-Face-Recognition-Android/reference/models/spoof-detection-models
- AWS Rekognition pricing — https://aws.amazon.com/rekognition/pricing/ ; Face Liveness regions (secondary) — https://hyperverge.co/blog/amazon-rekognition-vs-hyperverge-liveness/ ; AWS docs https://docs.aws.amazon.com/rekognition/latest/dg/face-liveness.html
- Azure Face Limited Access — https://learn.microsoft.com/legal/cognitive-services/computer-vision/limited-access-identity ; overview https://learn.microsoft.com/azure/ai-services/computer-vision/overview-identity
- VisionCamera frame processors (v4 docs) — https://visioncamera4.margelo.com/docs/guides/frame-processors ; Expo plugins guide https://visioncamera4.margelo.com/docs/guides/frame-processors-plugins-expo
- 2026 guide to VisionCamera v5 + ML Kit in Expo (secondary) — https://reactnativerelay.com/article/vision-camera-frame-processors-mlkit-2026
- react-native-fast-tflite — https://github.com/mrousavy/react-native-fast-tflite
- react-native-vision-camera-face-detector — https://classic.yarnpkg.com/en/package/react-native-vision-camera-face-detector
- Expo FaceDetector removed from SDK 51 — https://docs.expo.dev/versions/latest/sdk/facedetector
- NIST IR 8280, FRVT Part 3: Demographic Effects (Dec 2019) — https://doi.org/10.6028/NIST.IR.8280 ; NIST news https://www.nist.gov/publications/face-recognition-vendor-test-part-3-demographic-effects
