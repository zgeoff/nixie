import { z } from 'zod';
import { isJSONWithin } from './is-json-within';
import { layoutLimits, regionBackgroundSchema } from './region-background-schema';
import { regionEventContentSchema } from './region-content-schema';
import { reusedIDErrors } from './reused-id-errors';
import { screenContentSchema } from './screen-content-schema';
import { signedIn } from './signed-in';

export const pageErrorMessageLimit = 2000;

// the JSON that a page event or a message to a page carries
export const pageDataSchema = z.json();

export type PageData = z.output<typeof pageDataSchema>;

export const pageEventNameLimit = 64;

// The paths that serve a page's frame and its images. A frame's opaque origin sends no session
// cookie, so a ticket in the path is the whole check.
export const devicePagePaths = {
  frames: '/rpc/device/frames/',
  images: '/rpc/device/images/',
  packages: '/rpc/device/packages/',
} as const;

export const pageEventDataLimitBytes = 2048;
export const pageMessageLimitBytes = 16 * 1024;

export const pixelsSchema = z.object({
  width: z.int().min(1).max(20_000),
  height: z.int().min(1).max(20_000),

  // device pixels per CSS pixel, so a CSS size is the width divided by it
  pixelRatio: z.number().positive().max(16).default(1),

  // the IANA time zone of the device's browser, which a clock region shows its time in; a page that
  // sends none gets the deployment's default zone in a preview
  timeZone: z.string().max(64).refine(isTimeZone, 'an IANA time zone').exactOptional(),
});

const layoutRegionSchema = z.object({
  name: z.string(),
  column: z.int(),
  row: z.int(),
  columnSpan: z.int(),
  rowSpan: z.int(),

  // null for a region with no background, which shows the screen's black
  background: regionBackgroundSchema.nullable(),

  // null while the region is blank
  content: regionEventContentSchema.nullable(),

  // the short ID of the record that holds the content, which an error the region reports names
  shown: z.string().nullable(),
  until: z.iso.datetime().nullable(),
});

const layoutSchema = z.object({
  columns: z.array(z.string()).max(layoutLimits.columns),
  rows: z.array(z.string()).max(layoutLimits.rows),
  regions: z.array(layoutRegionSchema).max(layoutLimits.regions),
});

// The first screen event is what the screen shows now. A later screen event replaces it. A layout
// event comes apart from them, so a show that covers the layout does not drop it, and a null layout
// is none.
export const deviceEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('show'),
    content: screenContentSchema,
    until: z.iso.datetime().nullable(),
  }),
  z.object({ kind: z.literal('idle'), scene: z.array(screenContentSchema) }),
  z.object({ kind: z.literal('layout'), layout: layoutSchema.nullable() }),

  // A message that the assistant sent into a page region, which the device hands to the page. The
  // server sends each region's retained message again when a stream opens.
  // A declared fetch of a page refreshed, so the page's nixie.onData fires for its URL
  z.object({ kind: z.literal('data'), region: z.string(), shown: z.string(), url: z.string() }),
  z.object({
    kind: z.literal('message'),
    region: z.string(),
    shown: z.string(),
    data: pageDataSchema,

    // true for the page's state, which the device hands to the page again each time it loads
    retain: z.boolean(),
  }),
]);

export type DeviceEvent = z.output<typeof deviceEventSchema>;

export const notADeviceError = {
  message: 'This session has no device. Register one first',
  status: 409,
};

// A call on the session's own device row. A full session that holds no row registers one first.
const ownDevice = signedIn.errors({ NOT_A_DEVICE: notADeviceError });

export const devicesContract = {
  register: signedIn
    .errors(reusedIDErrors)
    .input(z.object({ clientActionID: z.uuid(), name: z.string().min(1).max(100) }))
    .output(z.object({ deviceID: z.string() })),

  resize: ownDevice.input(pixelsSchema).output(z.object({})),

  // An error that a region's content raised on the device, such as an uncaught error. The call
  // names the content by its shown ID, and returns STALE with no change when the region shows
  // other content by now.
  pageError: ownDevice
    .errors({
      STALE: { message: 'The region no longer shows that content', status: 409 },
    })
    .input(
      z.object({
        region: z.string().min(1).max(32),
        shown: z.string().min(1).max(100),
        message: z.string().min(1).max(pageErrorMessageLimit),
      }),
    )
    .output(z.object({})),

  // An event that a page sent with nixie.send. It carries no authority: the assistant reads it as
  // text from the page. The call returns STALE with no change when the region shows other content
  // by now or the screen is off, and returns with nothing kept when a limit drops the event.
  pageEvent: ownDevice
    .errors({
      STALE: { message: 'The region no longer shows that content', status: 409 },
    })
    .input(
      z.object({
        region: z.string().min(1).max(32),
        shown: z.string().min(1).max(100),
        name: z.string().min(1).max(pageEventNameLimit),
        data: pageDataSchema
          .refine((data) => isJSONWithin(data, pageEventDataLimitBytes), 'at most 2 KiB')
          .exactOptional(),
        wake: z.boolean().default(false),
      }),
    )
    .output(z.object({})),

  // One of the fetches that a page declared, as the server last fetched it. NOT_DECLARED names a
  // URL the page did not declare, REFUSED a fetch the rules or the fetcher refused, and NOT_READY
  // a fetch that has returned nothing yet.
  pageData: ownDevice
    .errors({
      STALE: { message: 'The region no longer shows that content', status: 409 },
      NOT_DECLARED: { message: 'The page did not declare that URL', status: 404 },
      REFUSED: { message: 'The fetch of that URL was refused', status: 403 },
      NOT_READY: { message: 'The fetch of that URL has returned nothing yet', status: 409 },
    })
    .input(
      z.object({
        region: z.string().min(1).max(32),
        shown: z.string().min(1).max(100),
        url: z.string().min(1).max(2000),
      }),
    )
    .output(
      z.object({
        status: z.int(),
        type: z.string(),
        body: z.string(),
        fetchedAt: z.iso.datetime(),
      }),
    ),

  setCapability: ownDevice
    .input(z.object({ capability: z.enum(['screen']), isOn: z.boolean() }))
    .output(z.object({ screen: z.enum(['on', 'off']) })),

  readImage: ownDevice
    .errors({
      NOT_SHOWN: { message: 'The device does not show this image now', status: 404 },
    })
    .input(z.object({ image: z.string().min(1).max(100) }))
    .output(z.file()),
};

function isTimeZone(zone: string): boolean {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone }).resolvedOptions().timeZone !== '';
  } catch {
    return false;
  }
}
