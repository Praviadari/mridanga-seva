// Face scan (Phase 3, from the P3-0 spike, docs/DECISIONS.md #307): the active liveness challenge — blink and
// turn the head, in a random order — run on the ML Kit values of each camera frame (eye-open probabilities,
// head yaw/pitch). Plain state machine, no React, so tests/face-scan.test.mjs can drive it with made-up frames.
//
// A printed photo cannot blink or turn; a phone replaying a video can, which is what the passive check
// (MiniFASNet) and the lawyer-facing limits in SPIKE_RESULT.md are for.

/** What the camera saw in one frame, reduced to the numbers the challenge needs. */
export type FaceSample = {
  t: number; // ms
  faces: number;
  yaw: number; // degrees, ML Kit Euler Y
  pitch: number; // degrees, ML Kit Euler X
  leftEye?: number; // 0..1 open probability
  rightEye?: number;
  widthShare: number; // face box width / frame width
};

export type Step = 'blink' | 'turn';

export type ChallengeSettings = {
  steps: readonly Step[];
  stepTimeoutMs: number; // per step
  frontalDeg: number; // |yaw| and |pitch| at most this = "looking at the camera"
  turnDeg: number; // |yaw| at least this = "turned"
  eyesClosed: number; // both eyes below = closed
  eyesOpen: number; // both eyes above = open
  minWidthShare: number; // face at least this share of the frame width
  steadyMs: number; // frontal this long before the challenge starts
  lostMs: number; // no face this long during the challenge = fail (someone swapped in)
};

export const DEFAULT_CHALLENGE: ChallengeSettings = {
  steps: ['blink', 'turn'],
  stepTimeoutMs: 8000,
  frontalDeg: 12,
  turnDeg: 22,
  eyesClosed: 0.25,
  eyesOpen: 0.6,
  minWidthShare: 0.22,
  steadyMs: 500,
  lostMs: 800,
};

export type ChallengeState =
  | { kind: 'waitFace'; since?: number; hint: Hint }
  | { kind: 'step'; index: number; phase: 'away' | 'back'; startedAt: number; lastFaceAt: number; startAt: number }
  | { kind: 'passed'; ms: number; at: number }
  | { kind: 'failed'; reason: FailReason; at: number };

export type Hint = 'noFace' | 'manyFaces' | 'closer' | 'lookStraight' | 'hold';
export type FailReason = 'timeout' | 'faceLost' | 'manyFaces';

export function initialChallenge(): ChallengeState {
  return { kind: 'waitFace', hint: 'noFace' };
}

/** A random order of the two steps, so a recorded video of one run does not fit the next. */
export function randomSteps(random: () => number = Math.random): Step[] {
  return random() < 0.5 ? ['blink', 'turn'] : ['turn', 'blink'];
}

function frontal(s: FaceSample, c: ChallengeSettings) {
  return Math.abs(s.yaw) <= c.frontalDeg && Math.abs(s.pitch) <= c.frontalDeg;
}

function eyesBelow(s: FaceSample, v: number) {
  return s.leftEye !== undefined && s.rightEye !== undefined && s.leftEye < v && s.rightEye < v;
}

function eyesAbove(s: FaceSample, v: number) {
  return s.leftEye !== undefined && s.rightEye !== undefined && s.leftEye > v && s.rightEye > v;
}

/** The next state after one frame. */
export function stepChallenge(state: ChallengeState, s: FaceSample, c: ChallengeSettings = DEFAULT_CHALLENGE): ChallengeState {
  if (state.kind === 'passed' || state.kind === 'failed') return state;

  if (state.kind === 'waitFace') {
    if (s.faces === 0) return { kind: 'waitFace', hint: 'noFace' };
    if (s.faces > 1) return { kind: 'waitFace', hint: 'manyFaces' };
    if (s.widthShare < c.minWidthShare) return { kind: 'waitFace', hint: 'closer' };
    if (!frontal(s, c)) return { kind: 'waitFace', hint: 'lookStraight' };
    const since = state.since ?? s.t;
    if (s.t - since < c.steadyMs) return { kind: 'waitFace', since, hint: 'hold' };
    return { kind: 'step', index: 0, phase: 'away', startedAt: s.t, lastFaceAt: s.t, startAt: s.t };
  }

  // A step is running.
  if (s.faces > 1) return { kind: 'failed', reason: 'manyFaces', at: s.t };
  if (s.faces === 0) {
    if (s.t - state.lastFaceAt > c.lostMs) return { kind: 'failed', reason: 'faceLost', at: s.t };
    return state;
  }
  if (s.t - state.startedAt > c.stepTimeoutMs) return { kind: 'failed', reason: 'timeout', at: s.t };

  const step = c.steps[state.index];
  const live = { ...state, lastFaceAt: s.t };
  let done = false;
  if (step === 'blink') {
    if (state.phase === 'away' && eyesBelow(s, c.eyesClosed)) return { ...live, phase: 'back' };
    if (state.phase === 'back' && eyesAbove(s, c.eyesOpen)) done = true;
  } else {
    if (state.phase === 'away' && Math.abs(s.yaw) >= c.turnDeg) return { ...live, phase: 'back' };
    if (state.phase === 'back' && frontal(s, c)) done = true;
  }
  if (!done) return live;
  if (state.index + 1 >= c.steps.length) return { kind: 'passed', ms: s.t - state.startAt, at: s.t };
  return { kind: 'step', index: state.index + 1, phase: 'away', startedAt: s.t, lastFaceAt: s.t, startAt: state.startAt };
}

/** Whether this frame is good for taking the face for the match: one face, frontal, eyes open, close enough. */
export function goodForCapture(s: FaceSample, c: ChallengeSettings = DEFAULT_CHALLENGE): boolean {
  return s.faces === 1 && s.widthShare >= c.minWidthShare && frontal(s, c) && (s.leftEye === undefined || eyesAbove(s, c.eyesOpen));
}

/** The translation key (face.challenge.*) of what to tell the person in a state. */
export type ChallengeKey =
  | 'face.challenge.noFace'
  | 'face.challenge.manyFaces'
  | 'face.challenge.closer'
  | 'face.challenge.lookStraight'
  | 'face.challenge.hold'
  | 'face.challenge.blink'
  | 'face.challenge.openEyes'
  | 'face.challenge.turn'
  | 'face.challenge.lookBack'
  | 'face.challenge.done'
  | 'face.challenge.timeout'
  | 'face.challenge.faceLost'
  | 'face.challenge.failedManyFaces';

/** What to tell the person for a state, as a translation key (en/te/hi in src/i18n/locales). */
export function challengeKey(state: ChallengeState, steps: readonly Step[]): ChallengeKey {
  switch (state.kind) {
    case 'waitFace':
      return `face.challenge.${state.hint}`;
    case 'step': {
      const step = steps[state.index];
      if (step === 'blink') return state.phase === 'away' ? 'face.challenge.blink' : 'face.challenge.openEyes';
      return state.phase === 'away' ? 'face.challenge.turn' : 'face.challenge.lookBack';
    }
    case 'passed':
      return 'face.challenge.done';
    case 'failed':
      return state.reason === 'manyFaces' ? 'face.challenge.failedManyFaces' : `face.challenge.${state.reason}`;
  }
}