import type { Clock } from '@heynixie/tasks';
import type { ToolDefinition } from '@heynixie/tools';

export interface TimeToolOptions {
  readonly clock: Pick<Clock, 'now'>;

  // the zone of the owner's newest message that carries one, or null when none does
  readonly findTimeZone: () => Promise<string | null>;

  // the zone the tool answers in when no message carries one
  readonly defaultZone: string;
}

const timeNowInput = { type: 'object', properties: {}, additionalProperties: false };

const timeNowOutput = {
  type: 'object',
  properties: {
    utc: { type: 'string' },
    local: { type: 'string' },
    weekday: { type: 'string' },
    timeZone: { type: 'string' },
    timeZoneFrom: { type: 'string', enum: ['message', 'default'] },
  },
  required: ['utc', 'local', 'weekday', 'timeZone', 'timeZoneFrom'],
  additionalProperties: false,
};

// Builds the time tool, which reads nixie's clock and answers in the owner's time zone: the zone of
// the owner's newest message that carries one, or the configured default. It reads only nixie's
// own log, so it runs direct, and every result field is the owner's data.
export function buildTimeTool(options: TimeToolOptions): ToolDefinition {
  return {
    name: 'time.now',
    description:
      'Returns the current time: utc, the ISO 8601 time in UTC; local, the ISO 8601 time with its ' +
      "UTC offset in the owner's time zone; the local weekday; and timeZone, the IANA zone. The " +
      "zone is the one the owner's device reported with their newest message, which follows them " +
      'when they travel; timeZoneFrom is message for that zone, or default when no message ' +
      'carried a zone and the configured default applies. Call it whenever an answer depends on ' +
      'the current date or time, such as today, tomorrow, or how long until a time.',
    input: timeNowInput,
    output: timeNowOutput,
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: {
        utc: 'owner_data',
        local: 'owner_data',
        weekday: 'owner_data',
        timeZone: 'owner_data',
        timeZoneFrom: 'owner_data',
      },
    },
    execution: 'direct',
    run: async () => {
      const found = await options.findTimeZone();

      const timeZone = found ?? options.defaultZone;

      const now = new Date(options.clock.now());

      return {
        status: 'ok',
        result: {
          utc: now.toISOString(),
          local: formatLocalTime(now, timeZone),
          weekday: now.toLocaleDateString('en-US', { timeZone, weekday: 'long' }),
          timeZone,
          timeZoneFrom: found === null ? 'default' : 'message',
        },
      };
    },
  };
}

// The ISO 8601 local time with its UTC offset, to the second, such as 2026-10-13T12:02:03+11:00.
function formatLocalTime(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(at);

  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';

  // longOffset names UTC itself GMT, and every other offset GMT+hh:mm or GMT-hh:mm
  const offset = getPart('timeZoneName').replace(/^GMT$/u, 'GMT+00:00').replace(/^GMT/u, '');

  return (
    `${getPart('year')}-${getPart('month')}-${getPart('day')}` +
    `T${getPart('hour')}:${getPart('minute')}:${getPart('second')}${offset}`
  );
}
