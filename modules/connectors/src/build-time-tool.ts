import type { Clock } from '@heynixie/clock';
import type { ToolDefinition } from '@heynixie/tools';

export interface TimeToolOptions {
  readonly clock: Pick<Clock, 'now'>;

  readonly findTimeZone: () => Promise<string | null>;

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

  // Intl's longOffset names UTC itself GMT, and every other offset GMT+hh:mm or GMT-hh:mm.
  const offset = getPart('timeZoneName').replace(/^GMT$/u, 'GMT+00:00').replace(/^GMT/u, '');

  return (
    `${getPart('year')}-${getPart('month')}-${getPart('day')}` +
    `T${getPart('hour')}:${getPart('minute')}:${getPart('second')}${offset}`
  );
}
