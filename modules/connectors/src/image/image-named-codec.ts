import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const imageNamedCodec = defineRecordCodec('image.named', z.object({ image: z.string() }));
