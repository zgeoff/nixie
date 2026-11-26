import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A package that the owner approved and nixie unpacked. It holds only what the registry published,
// so a forget has nothing in it to erase.
export const devicePackageAddedCodec = defineRecordCodec(
  'device.package_added',
  z.object({
    name: z.string(),
    version: z.string(),
    integrity: z.string(),
    size: z.int().nonnegative(),
    publisher: z.string(),
  }),
);
