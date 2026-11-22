import { Collection } from '@msw/data';
import { z } from 'zod';

// the sizes that devices.resize received, so a test reads what the page sent
const resizes = new Collection({
  schema: z.object({ width: z.int(), height: z.int() }),
});

// the sessions that hold no device row: a session has one unless it is listed here
const sessionsWithoutDevice = new Collection({
  schema: z.object({ sessionID: z.uuid() }),
});

export const deviceStore = {
  resizes,
  sessionsWithoutDevice,
  hasDevice: (sessionID: string): boolean =>
    sessionsWithoutDevice.findFirst((query) => query.where({ sessionID })) === undefined,
  reset: (): void => {
    resizes.clear();
    sessionsWithoutDevice.clear();
  },
};
