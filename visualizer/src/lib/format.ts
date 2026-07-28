const TIME = new Intl.DateTimeFormat('uk-UA', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso));
}

/** "щойно", "12 с тому", "3 хв тому" — enough precision for a live demo. */
export function formatAgo(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));

  if (seconds < 3) {
    return 'щойно';
  }
  if (seconds < 60) {
    return `${seconds} с тому`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)} хв тому`;
  }

  return formatTime(iso);
}

export function plural(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const mod100 = count % 100;
  const mod10 = count % 10;

  if (mod100 >= 11 && mod100 <= 14) {
    return many;
  }
  if (mod10 === 1) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return few;
  }

  return many;
}
