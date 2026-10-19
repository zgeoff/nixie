import { z } from 'zod';

// The definitions format this release writes. It reads this format and the one before, because an
// image upgrade and a definitions change land in either order.
const formatVersion = 1;
const readableFormats = [formatVersion - 1, formatVersion].filter((version) => version >= 1);

// nixie.yaml as the seed reads it: a format this release reads. The seed reads no other key, so the
// manifest may hold more.
export const manifestSchema = z.looseObject({ format: z.literal(readableFormats) });
