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

// the events that devices.pageEvent received, so a test reads what a page sent
const pageEvents = new Collection({
  schema: z.object({
    region: z.string(),
    shown: z.string(),
    name: z.string(),
    data: z.json().nullable(),
    wake: z.boolean(),
  }),
});

// the sessions that hold no device row: a session has one unless it is listed here
const sessionsWithoutDevice = new Collection({
  schema: z.object({ sessionID: z.uuid() }),
});

// the sessions of the device scope, which may call only the device procedures
const screenSessions = new Collection({
  schema: z.object({ sessionID: z.uuid() }),
});

// the screen state of a session's device once the device or a test sets it: a screen device starts
// off and every other device starts on
const screenSwitches = new Collection({
  schema: z.object({ sessionID: z.uuid(), isOn: z.boolean() }),
});

// the layout the stream sends to a device, which a test sets; null sends none
const layoutHolder: { layout: Extract<DeviceEvent, { kind: 'layout' }>['layout'] } = {
  layout: null,
};

// the messages the stream sends to a device right after its layout, which a test sets
const messageHolder: { messages: readonly Extract<DeviceEvent, { kind: 'message' }>[] } = {
  messages: [],
};

export const deviceStore = {
  resizes,
  pageErrors,
  pageEvents,
  layoutHolder,
  messageHolder,
  sessionsWithoutDevice,
  screenSessions,
  screenSwitches,
  hasDevice: (sessionID: string): boolean =>
    sessionsWithoutDevice.findFirst((query) => query.where({ sessionID })) === undefined,
  readScreen: (sessionID: string): boolean =>
    screenSwitches.findFirst((query) => query.where({ sessionID }))?.isOn ??
    screenSessions.findFirst((query) => query.where({ sessionID })) === undefined,
  reset: (): void => {
    resizes.clear();
    pageErrors.clear();
    pageEvents.clear();
    sessionsWithoutDevice.clear();
    screenSessions.clear();
    screenSwitches.clear();

    layoutHolder.layout = null;
    messageHolder.messages = [];
  },
};
