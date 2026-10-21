import invariant from 'tiny-invariant';
import type { MessageTimeOptions } from './types';

export function formatMemoryDay(time: number, options: MessageTimeOptions): string {
  const recorded = getDayParts(new Date(time), options.defaultZone);

  const year =
    recorded.year === getDayParts(options.now, options.defaultZone).year ? '' : ` ${recorded.year}`;

  return `${recorded.day} ${recorded.month}${year}`;
}

interface DayParts {
  readonly day: string;
  readonly month: string;
  readonly year: string;
}

function getDayParts(at: Date, zone: string): DayParts {
  const parts = getDayFormat(zone).formatToParts(at);

  const getPart = (type: keyof DayParts): string => {
    const value = parts.find((part) => part.type === type)?.value;

    invariant(value !== undefined, `the date has no ${type}`);

    return value;
  };

  return { day: getPart('day'), month: getPart('month'), year: getPart('year') };
}

// Building an Intl.DateTimeFormat costs far more than calling one, and the pinned core's budget
// renders every pinned item on each write, so each zone keeps one format.
const dayFormats = new Map<string, Intl.DateTimeFormat>();

function getDayFormat(zone: string): Intl.DateTimeFormat {
  const known = dayFormats.get(zone);

  if (known !== undefined) {
    return known;
  }

  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  dayFormats.set(zone, format);

  return format;
}
