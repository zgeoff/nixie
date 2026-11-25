import { expect, test } from 'bun:test';
import { deviceEventSchema } from './devices-contract';
import { regionBackgroundSchema } from './region-background-schema';

test.each(['black', 'teal', '#a0B1c2'])('it takes the background %s', (background) => {
  expect(regionBackgroundSchema.safeParse(background).success).toBeTrue();
});

test.each(['chartreuse', '#abc', '#12345g', 'rgb(0,0,0)', ''])(
  'it refuses the background %s',
  (background) => {
    expect(regionBackgroundSchema.safeParse(background).success).toBeFalse();
  },
);

test.each([
  {
    title: '12 columns, 12 rows and 36 regions',
    columns: 12,
    rows: 12,
    regions: 36,
    expected: true,
  },
  { title: '13 columns', columns: 13, rows: 12, regions: 36, expected: false },
  { title: '13 rows', columns: 12, rows: 13, regions: 36, expected: false },
  { title: '37 regions', columns: 12, rows: 12, regions: 37, expected: false },
])('it gives $expected for a layout event of $title', (row) => {
  const event = {
    kind: 'layout',
    layout: {
      columns: Array.from({ length: row.columns }, () => '1fr'),
      rows: Array.from({ length: row.rows }, () => '1fr'),
      regions: Array.from({ length: row.regions }, (_unused, index) => ({
        name: `region${String(index)}`,
        column: 1,
        row: 1,
        columnSpan: 1,
        rowSpan: 1,
        background: null,
        content: null,
        until: null,
      })),
    },
  };

  expect(deviceEventSchema.safeParse(event).success).toBe(row.expected);
});
