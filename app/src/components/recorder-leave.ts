// Stopping a recording when its screen goes (Back, or another screen replaces it), for
// components/audio-recorder.tsx. Kept apart from the component so the unit tests can run it in Node
// (tests/back-crash.test.mjs).
//
// Why it is careful (Back crash 12-10-2026, docs/DECISIONS.md #260): expo-audio's useAudioRecorder
// releases the phone's recorder in its own cleanup when the screen goes. A cleanup of ours that reads
// the recorder after that threw on Android ("The 1st argument cannot be cast to type class
// expo.modules.audio.AudioRecorder (received class java.lang.Integer)"), and the root ErrorBoundary
// showed "Something went wrong" instead of the previous screen. The component therefore calls this
// from a layout-effect cleanup, which React runs before the release; and whatever the phone answers,
// leaving a screen must never crash.

/** What this needs of an expo-audio AudioRecorder. */
export type LeavingRecorder = {
  readonly isRecording: boolean;
  stop: () => Promise<void>;
};

/** Stops `recorder` if it is recording. Never throws, and a failed stop is ignored. */
export function stopRecorderOnLeave(recorder: LeavingRecorder): void {
  try {
    if (recorder.isRecording) void recorder.stop().catch(() => undefined);
  } catch {
    // Already released by expo-audio: there is nothing left to stop.
  }
}
