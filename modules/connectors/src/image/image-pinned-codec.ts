import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const imagePinnedCodec = defineRecordCodec('image.pinned', z.object({ image: z.string() }));
