// Stand-ins for what src/lib/device-traces.ts calls besides the files: expo-image's caches, the saved QR card,
// the push notifications, the practice reminder (#402), the face code (Phase 3, #310) and the wake-up alarm (#791).
// Each call is counted in globalThis.__testCalls.

const calls = () => (globalThis.__testCalls ??= []);

export const Image = {
  clearMemoryCache: async () => void calls().push('image-memory'),
  clearDiskCache: async () => void calls().push('image-disk'),
};

export function clearSavedCard() {
  calls().push('saved-card');
}

export async function dismissNotifications() {
  calls().push('notifications');
}

export async function forgetPracticeReminders() {
  calls().push('practice-reminder');
}

export async function forgetFace() {
  calls().push('face');
}

export async function forgetWakeAlarm() {
  calls().push('wake-alarm');
}
