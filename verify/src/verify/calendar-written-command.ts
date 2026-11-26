import type { HttpClient } from '@wringer/http';
import { z } from 'zod';
import { controlRoutes } from './harness/control-routes';
import { pickCalendarWrittenRefusal } from './pick-calendar-written-refusal';
import { postControl } from './post-control';
import { refuseHarnessless } from './refuse-harnessless';
import { throwRefusal } from './throw-refusal';

const argsSchema = z.strictObject({
  count: z.int().nonnegative(),
  sendUpdates: z.enum(['all', 'none']).optional(),
  guest: z.string().min(1).optional(),
});

interface CalendarWrittenContext {
  readonly target: string;
  readonly drivers: { readonly http: HttpClient };
}

// The `calendar written` command reads the event writes that the fake Calendar took, and fails with
// `check-failed` when their count, the emails the last one asked for, or the guest it holds differ
// from the journey's.
export const calendarWrittenCommand = {
  path: ['calendar', 'written'],
  summary:
    'Check that the fake Calendar took --count event writes, that the last asked for --send-updates, and that its event has the guest --guest',
  effect: 'read',
  args: argsSchema,
  data: controlRoutes.calendarWrites.output,
  run: async (args: z.output<typeof argsSchema>, ctx: CalendarWrittenContext) => {
    refuseHarnessless(ctx.target, 'calendar written');

    const read = await postControl(ctx.drivers.http, controlRoutes.calendarWrites, {});

    throwRefusal(pickCalendarWrittenRefusal(read.writes, args), read);

    return read;
  },
} as const;
