/** Calendar-day labels for compact feed rows; exact timestamps remain available. */
export function postDateLabel(publishedAt: number, now = Date.now()): string {
  const date = new Date(publishedAt * 1000);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  const today = new Date(now);
  const day = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86400000;
  const age = day(today) - day(date);
  if (age === 0) return 'Today';
  if (age === 1) return 'Yesterday';
  if (age > 1 && age <= 7) return `${age} days ago`;
  return date.toLocaleDateString();
}
