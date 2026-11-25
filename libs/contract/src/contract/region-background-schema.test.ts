import { expect, test } from 'bun:test';
import { layoutLimits, regionBackgroundSchema } from './region-background-schema';

test.each(['black', 'teal', '#a0B1c2'])('it takes the background %s', (background) => {
  expect(regionBackgroundSchema.safeParse(background).success).toBeTrue();
});

test.each(['chartreuse', '#abc', '#12345g', 'rgb(0,0,0)', ''])(
  'it refuses the background %s',
  (background) => {
    expect(regionBackgroundSchema.safeParse(background).success).toBeFalse();
  },
);

test('it caps a layout at 12 columns, 12 rows and 36 regions', () => {
  expect(layoutLimits).toStrictEqual({ columns: 12, rows: 12, regions: 36 });
});
