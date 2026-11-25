import type { DeviceEvent } from '@heynixie/contract';
import { Collection } from '@msw/data';
import { z } from 'zod';

// the sizes that devices.resize received, so a test reads what the page sent
const resizes = new Collection({
  schema: z.object({
    width: z.int(),
    height: z.int(),
    pixelRatio: z.number(),
    timeZone: z.string().nullable(),
  }),
});

// the errors that devices.pageError received, so a test reads what the page reported
const pageErrors = new Collection({
  schema: z.object({ region: z.string(), shown: z.string(), message: z.string() }),
});

// the sessions that hold no device row: a session has one unless it is listed here
const sessionsWithoutDevice = new Collection({
  schema: z.object({ sessionID: z.uuid() }),
});

// the layout the stream sends to a device, which a test sets; null sends none
const layoutHolder: { layout: Extract<DeviceEvent, { kind: 'layout' }>['layout'] } = {
  layout: null,
};

export const deviceStore = {
  resizes,
  pageErrors,
  layoutHolder,
  sessionsWithoutDevice,
  hasDevice: (sessionID: string): boolean =>
    sessionsWithoutDevice.findFirst((query) => query.where({ sessionID })) === undefined,
  reset: (): void => {
    resizes.clear();
    pageErrors.clear();
    sessionsWithoutDevice.clear();

    layoutHolder.layout = null;
  },
};
