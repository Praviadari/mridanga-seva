// The person's choice of light or dark screens on My profile (Praveen 14-10-2026, docs/DECISIONS.md #361): "Same as
// phone" (the default: the phone's own setting), "Light" or "Dark". Remembered on this device only. Pure, so tests
// run it; the remembered value and the switch are theme/appearance.ts.

/** The three choices, in the order they are offered. */
export const APPEARANCES = ['system', 'light', 'dark'] as const;

/** One of the choices: 'system' follows the phone. */
export type AppearanceChoice = (typeof APPEARANCES)[number];

/** The choice saved on this device, or 'system' when nothing (or something unknown) is saved. */
export function appearanceFrom(saved: string | null): AppearanceChoice {
  return (APPEARANCES as readonly string[]).includes(saved ?? '') ? (saved as AppearanceChoice) : 'system';
}

/** True when the screens are drawn dark: the person's choice, or the phone's setting under "Same as phone". */
export function isDarkFor(choice: AppearanceChoice, phone: string | null | undefined): boolean {
  return choice === 'system' ? phone === 'dark' : choice === 'dark';
}
