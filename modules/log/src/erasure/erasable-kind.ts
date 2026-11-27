import { z } from 'zod';

export const erasableKindSchema = z.enum([
  'memory_item',
  'moment',
  'note',
  'record',
  'image',
  'conversation',
  'credential',
  'phone_text',
]);

export type ErasableKind = z.infer<typeof erasableKindSchema>;
