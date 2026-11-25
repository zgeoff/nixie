import { z } from 'zod';

export const regionBackgroundNames = [
  'black',
  'white',
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'navy',
  'purple',
  'pink',
  'brown',
] as const;

// The most a layout takes: columns, rows and named regions.
export const layoutLimits = { columns: 12, rows: 12, regions: 36 } as const;
const hexColourPattern = /^#[0-9a-f]{6}$/iu;

// A region's background: a colour from the fixed palette of names, or `#rrggbb`.
export const regionBackgroundSchema = z.union([
  z.enum(regionBackgroundNames),
  z.string().regex(hexColourPattern),
]);

export type RegionBackground = z.output<typeof regionBackgroundSchema>;
