import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { trustLevels } from './types';

// The notice of a places.narrow call that lowered or removed an entry. It sits on the call's
// thread and holds only the entry's short ID, so the key stays in the directory, where a forget
// reaches it. A removal has no level.
export const placesNarrowedCodec = defineRecordCodec(
  'places.narrowed',
  z.object({
    shortID: z.string(),
    callID: z.string(),
    trust: z.enum(trustLevels).exactOptional(),
  }),
);
