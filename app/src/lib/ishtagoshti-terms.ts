// Whether a login waiting for the desk is offered "Join Ishtagoshti" on the waiting screen (audit S4-08,
// docs/DECISIONS.md #268). Off until the team's real Ishtagoshti terms replace the "TEST —" placeholder
// wording (ishtagoshtiJoin.termsBody / parentTerms in en, te and hi): joining moves the login out of
// Register a student's waiting list (Accept then answers not_waiting), and nobody should agree to
// placeholder terms. To turn it on: put the real wording in the three locale files, set this to true
// and publish an update; tests/form-checks.test.mjs refuses true while any language still says TEST.

export const IG_JOIN_FOR_WAITING = false;
