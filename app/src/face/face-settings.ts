// Face scan (Phase 3): the fixed numbers of the phone side, in one place (docs/DECISIONS.md #307-#312).
// The thresholds are the spike's starting values; the test day and the pilot (P3-7) tune them. Pure, no
// imports, so the unit tests read the same values.

/**
 * The embedding model this app carries (assets/models). Must equal the server's setting
 * face_model_version (migration 0060): the server refuses an enrolment with another text
 * (face_model_outdated), and phones wipe a face code made with another model.
 */
export const FACE_MODEL_VERSION = 'sface-2021dec-int8';

/** Pictures taken for one enrolment after the blink/turn challenge (WORK_PLAN P3-4: 3-5). */
export const ENROL_FRAMES = 5;
/** Fewest good pictures an enrolment may be made from (some may fail on a slow phone). */
export const ENROL_FRAMES_MIN = 3;
/** Gap between two pictures of one enrolment, so they are not the same frame twice. */
export const ENROL_FRAME_GAP_MS = 350;

/**
 * Real-face score (MiniFASNet pair, 0..1) every enrolment picture must reach. Spike default; the test day
 * measures printed photos and screen replays against it (SPIKE_RESULT §9).
 */
export const LIVE_SCORE_MIN = 0.8;
/** Each picture's cosine to the mean of all of them: below this, the pictures are not of one face. */
export const SELF_MATCH_MIN = 0.5;

/** The re-enrol prompt shows this many days before the enrolment ends (12 months minor / 24 adult). */
export const EXPIRY_PROMPT_DAYS = 30;
/** How often the code screen asks the server whether the coordinator has typed the code. */
export const CONFIRM_POLL_MS = 4000;
/**
 * A waiting enrolment kept on the phone longer than this is dropped even without internet: the
 * server ends an unfinished request after an hour anyway (face_housekeeping).
 */
export const PENDING_MAX_MS = 60 * 60 * 1000;
