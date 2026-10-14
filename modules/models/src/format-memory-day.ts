import invariant from 'tiny-invariant';
import type { MessageTimeOptions } from './types';

// Formats the day a memory version was recorded, in the default zone, as in 13 Oct. The year shows
// only when it is not the current year in that zone, as in 13 Oct 2025.
export function formatMemoryDay(time: number, options: MessageTimeOptions): string {
  const recorded = readDayParts(new Date(time), options.defaultZone);
  const year =
    recorded.year === readDayParts(options.now, options.defaultZone).year
      ? ''
      : ` ${recorded.year}`;

  return `${recorded.day} ${recorded.month}${year}`;
}

interface DayParts {
  readonly day: string;
  readonly month: string;
  readonly year: string;
}

function readDayParts(at: Date, zone: string): DayParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(at);
  const getPart = (type: keyof DayParts): string => {
    const value = parts.find((part) => part.type === type)?.value;

    // the format asks for every part, so Intl returns each one
    invariant(value !== undefined, `the date has no ${type}`);
    return value;
  };

  return { day: getPart('day'), month: getPart('month'), year: getPart('year') };
}
