import { eventIterator } from '@orpc/contract';
import { z } from 'zod';
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

export const devicesContract = {
  follow: signedIn
    .input(z.object({ pixels: pixelsSchema }))
    .output(eventIterator(deviceEventSchema)),

  setCapability: signedIn
    .input(z.object({ capability: z.enum(['screen']), isOn: z.boolean() }))
    .output(z.object({ screen: z.enum(['on', 'off']) })),

  readImage: signedIn
    .errors({
      NOT_SHOWN: { message: 'The device does not show this image now', status: 404 },
    })
    .input(z.object({ image: z.string().min(1).max(100) }))
    .output(z.file()),
};
