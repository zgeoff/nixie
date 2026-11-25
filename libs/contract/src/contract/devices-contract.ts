import { z } from 'zod';
import { layoutLimits, regionBackgroundSchema } from './region-background-schema';
import { regionContentSchema } from './region-content-schema';
import { reusedIDErrors } from './reused-id-errors';
import { screenContentSchema } from './screen-content-schema';
import { signedIn } from './signed-in';

export const pageErrorMessageLimit = 2000;

export const pixelsSchema = z.object({
  width: z.int().min(1).max(20_000),
  height: z.int().min(1).max(20_000),

  // device pixels per CSS pixel, so a CSS size is the width divided by it
  pixelRatio: z.number().positive().max(16).default(1),
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
  content: regionContentSchema.nullable(),

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
