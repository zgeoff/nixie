import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// An event that a page sent with nixie.send. The page's data is erasable, so a forget removes it
// and the record stays as the count of the device's wakes.
export const devicePageEventCodec = defineRecordCodec(
  'device.page_event',
  z.object({
    device: z.string(),

    // the device's name when the event arrived, which the line the model reads names
    deviceName: z.string(),
    region: z.string(),
    shown: z.string(),
    name: z.string(),

    // true only when the page asked for it and the device's wake limit had room
    wake: z.boolean(),
  }),
);
