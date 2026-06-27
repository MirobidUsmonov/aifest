export const FORUM_DATE = new Date('2026-06-23T10:00:00+05:00');

export function getCountdown(now = new Date()) {
  const diff = Math.max(0, FORUM_DATE.getTime() - now.getTime());
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1_000);
  return { days, hours, minutes, seconds, total: diff };
}
