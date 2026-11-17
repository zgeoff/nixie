import { buildLocalInstant } from '@heynixie/triggers';
import { formatZonedISO } from '../../utils/format-zoned-iso';

const offsetPattern = /(?:Z|[+-]\d{2}:\d{2})$/u;

const localPattern =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2})(?:\.\d+)?)?$/u;

// An `at` that holds an offset or Z stays as it is. One without an offset is read in the zone and
// gets the zone's offset at that time. A time that the zone's clock skips moves to the first
// instant after the gap.
export function buildOffsetAt(at: string, zone: string): string {
  const parts = offsetPattern.test(at) ? null : localPattern.exec(at)?.groups;

  if (parts === undefined || parts === null) {
    return at;
  }

  const instant =
    buildLocalInstant(
      { year: Number(parts['year']), month: Number(parts['month']), day: Number(parts['day']) },
      Number(parts['hour']) * 60 + Number(parts['minute']),
      zone,
    ) +
    Number(parts['second'] ?? 0) * 1000;

  return formatZonedISO(instant, zone);
}
