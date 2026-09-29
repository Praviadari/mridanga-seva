// Shapes of the login data the app works with. They mirror the `profiles` table and the
// `app_role` type in supabase/migrations/0001_phase1.sql; change both together.

/** A person's role, given by the database. See docs/ARCHITECTURE.md "Roles". */
export type AppRole = 'pending' | 'guru' | 'coordinator' | 'student' | 'kiosk';

/** One row of `profiles`: the person behind a login. */
export type Profile = {
  id: string;
  role: AppRole;
  full_name: string;
  email: string | null;
  /** 'en', 'te' or 'hi'. */
  language: string;
  /** False when the Guru has switched the account off. */
  active: boolean;
};

/**
 * Which part of the app a person may use right now. The root layout (src/app/_layout.tsx)
 * shows only the screens of this area.
 *
 * - `loading`: still finding out (saved login, profile); the splash screen shows
 * - `signedOut`: sign in, create an account, forgot password
 * - `recovery`: opened a password-reset link (web only), must set a new password
 * - `pending`: signed in but no usable role yet (new sign-up, switched off, door tablet)
 * - `guru`, `coordinator`, `student`: that role's screens
 */
export type Area =
  | 'loading'
  | 'signedOut'
  | 'recovery'
  | 'pending'
  | 'guru'
  | 'coordinator'
  | 'student';
