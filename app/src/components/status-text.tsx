// A line that says how many things a search or filter found, read out by screen readers when it changes
// (audit P2-03, docs/DECISIONS.md #314). role="status" alone is a live region only on the web; Android's
// TalkBack needs accessibilityLiveRegion. "Polite": it waits until the reader has finished what it is saying.

import { AppText, type AppTextProps } from './app-text';

/** A result count, spoken by TalkBack and the browser's reader when it changes. */
export function StatusText(props: AppTextProps) {
  return <AppText role="status" accessibilityLiveRegion="polite" {...props} />;
}
