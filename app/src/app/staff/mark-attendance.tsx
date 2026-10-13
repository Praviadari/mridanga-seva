// C5 Mark attendance opened from a screen on top of the tabs (coordinator Overview "Visits today",
// docs/DECISIONS.md #301). Opening the Attendance tab's own address from such a screen makes a second
// copy of the tabs, and Back lands on that copy's Home (audit R4-01); this address opens the same page
// on top, so Back returns to the screen it was opened from. The page is the tab's ((tabs)/attendance.tsx).

import MarkAttendanceScreen from './(tabs)/attendance';

/** Mark attendance, on top of the screen that opened it. */
export default function MarkAttendanceOnTopScreen() {
  return <MarkAttendanceScreen />;
}
