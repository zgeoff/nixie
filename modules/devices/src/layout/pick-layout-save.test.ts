import { expect, test } from 'bun:test';
import { pickLayoutSave } from './pick-layout-save';

test('#pickLayoutSave gives none for a device with no layout', () => {
  expect(pickLayoutSave({ layout: null, layoutSequence: null, isNameTaken: false })).toStrictEqual({
    status: 'none',
  });
});

test.each([
  { title: 'a free name', isNameTaken: false },
  { title: 'a name that is taken', isNameTaken: true },
])('#pickLayoutSave saves the shown record of each region under $title', (row) => {
  const layout = {
    layoutID: 'layout1',
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [
      {
        name: 'note',
        column: 1,
        row: 1,
        columnSpan: 1,
        rowSpan: 1,
        background: null,
        shown: {
          shownID: 'shown12',
          sequence: 12,
          content: { kind: 'markdown' as const, markdown: 'text' },
          untilMs: null,
        },
      },
      {
        name: 'clock',
        column: 1,
        row: 1,
        columnSpan: 1,
        rowSpan: 1,
        background: null,
        shown: null,
      },
    ],
  };

  expect(pickLayoutSave({ layout, layoutSequence: 7, isNameTaken: row.isNameTaken })).toStrictEqual(
    {
      status: 'save',
      isReplaced: row.isNameTaken,
      layoutSequence: 7,
      regions: [{ region: 'note', shownSequence: 12 }],
    },
  );
});
