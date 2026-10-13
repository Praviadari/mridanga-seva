// C7 Student list opened from a screen on top of the tabs (Overview "Students in class",
// docs/DECISIONS.md #301). Opening the Students tab's own address from such a screen makes a second
// copy of the tabs, and Back lands on that copy's Home (audit R4-01); this address opens the same page
// on top, so Back returns to the screen it was opened from. The page is the tab's ((tabs)/students.tsx).

import StudentListScreen from './(tabs)/students';

/** The student list, on top of the screen that opened it. */
export default function ClassListScreen() {
  return <StudentListScreen />;
}
