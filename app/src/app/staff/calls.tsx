// C10 Follow-up calls opened from a screen on top of the tabs (Overview "Follow-up calls" / "My calls",
// Follow-ups by coordinator, docs/DECISIONS.md #301). Opening the Calls tab's own address from such a
// screen makes a second copy of the tabs, and Back lands on that copy's Home (audit R4-01); this address
// opens the same page on top, so Back returns to the screen it was opened from. The page is the tab's
// ((tabs)/follow-up.tsx), with the same ?scope= and ?assignee= filters.

import FollowUpScreen from './(tabs)/follow-up';

/** Follow-up calls, on top of the screen that opened them. */
export default function CallsScreen() {
  return <FollowUpScreen />;
}
