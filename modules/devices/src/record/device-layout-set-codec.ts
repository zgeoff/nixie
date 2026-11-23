import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const layoutRegionSchema = z.object({
  name: z.string(),
  column: z.int(),
  row: z.int(),
  columnSpan: z.int(),
  rowSpan: z.int(),
});

const layoutGridSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.string()),
  regions: z.array(layoutRegionSchema),
});

export const deviceLayoutSetCodec = defineRecordCodec(
  'device.layout_set',
  z.object({
    device: z.string(),

    // the short ID the assistant reads
    layoutID: z.string(),

    // null for a layout that was cleared
    layout: layoutGridSchema.nullable(),
  }),
);
