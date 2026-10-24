// Web push on the phones: never (docs/DECISIONS.md #603). Metro uses ./web-push.web.ts in the web version; the
// Android app keeps its own push (lib/push.ts) and its local practice reminder, and My profile shows no web push
// section there (components/web-push-section.tsx answers null for 'native').

export type WebPushPlace = 'ready' | 'iphone-add-to-home' | 'iphone-too-old' | 'unsupported' | 'not-set-up' | 'native';
export type WebPushState = 'on' | 'off' | 'blocked';

/** Always 'native' in the phone app. */
export function webPushHere(): WebPushPlace {
  return 'native';
}

/** Always 'off' in the phone app. */
export async function webPushState(): Promise<WebPushState> {
  return 'off';
}

/** Does nothing in the phone app. */
export async function turnOnWebPush(): Promise<'on' | 'blocked' | 'failed'> {
  return 'failed';
}

/** Does nothing in the phone app. */
export async function turnOffWebPush(): Promise<void> {}

/** Does nothing in the phone app. */
export async function refreshWebPush(): Promise<void> {}

/** Does nothing in the phone app. */
export async function forgetWebPush(): Promise<void> {}

/** Does nothing in the phone app. */
export function forgetWebPushNote(): void {}
