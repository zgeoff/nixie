import { eventIterator } from '@orpc/contract';
import { z } from 'zod';
import { reusedIDErrors } from './reused-id-errors';
import { screenContentSchema } from './screen-content-schema';
import { signedIn } from './signed-in';

const pixelsSchema = z.object({
  width: z.int().min(1).max(20_000),
  height: z.int().min(1).max(20_000),
});

// The first event is what the screen shows now. A later event replaces it.
export const deviceEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('show'),
    content: screenContentSchema,
    until: z.iso.datetime().nullable(),
  }),
  z.object({ kind: z.literal('idle'), scene: z.array(screenContentSchema) }),
]);

export type DeviceEvent = z.output<typeof deviceEventSchema>;

// A call on the session's own device row. A full session that holds no row registers one first.
const ownDevice = signedIn.errors({
  NOT_A_DEVICE: {
    message: 'This session has no device. Register one first',
    status: 409,
  },
});

export const devicesContract = {
  register: signedIn
    .errors(reusedIDErrors)
    .input(z.object({ clientActionID: z.uuid(), name: z.string().min(1).max(100) }))
    .output(z.object({ deviceID: z.string() })),

  follow: ownDevice
    .input(z.object({ pixels: pixelsSchema }))
    .output(eventIterator(deviceEventSchema)),

  resize: ownDevice.input(pixelsSchema).output(z.object({})),

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
