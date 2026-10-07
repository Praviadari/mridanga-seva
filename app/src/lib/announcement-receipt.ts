// The staff detail of one announcement (C15) after its first opening: the receipt just saved is
// written into what was loaded, instead of loading the seven requests again (audit D9-09).

/** The parts of the staff detail a receipt changes (src/data/announcements.ts). */
type Detail = {
  announcement: { readByMe: boolean };
  seenCount: { seen: number };
  audience: { profileId: string; readAt: string | null }[];
};

/**
 * The detail as it reads once `myId` has opened it at `at` (ISO time): read by me, and, when I am
 * one of the people it is addressed to, listed as seen and counted once more.
 */
export function withMyReceipt<T extends Detail>(detail: T, myId: string, at: string): T {
  const wasUnseen = detail.audience.some((m) => m.profileId === myId && m.readAt === null);
  return {
    ...detail,
    announcement: { ...detail.announcement, readByMe: true },
    audience: detail.audience.map((m) => (m.profileId === myId && m.readAt === null ? { ...m, readAt: at } : m)),
    seenCount: wasUnseen ? { ...detail.seenCount, seen: detail.seenCount.seen + 1 } : detail.seenCount,
  };
}
