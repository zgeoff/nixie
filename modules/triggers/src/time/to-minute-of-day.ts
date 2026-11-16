// 'HH:MM' as the minutes since midnight
export function toMinuteOfDay(clockTime: string): number {
  const [hour = '0', minute = '0'] = clockTime.split(':');

  return Number(hour) * 60 + Number(minute);
}
