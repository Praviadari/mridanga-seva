// The web version loads the staff screens as one file of their own (src/web-routes/lazy-staff.tsx, docs/DECISIONS.md
// #590); the root layout starts that download as soon as a staff login is known.

export { preloadStaffArea } from '@/web-routes/lazy-staff';
