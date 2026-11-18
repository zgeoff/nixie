import { expect, test } from 'bun:test';
import { collectSentFiles } from './collect-sent-files';

test('it reads a sent file from a call of the send tool and its result', () => {
  expect(
    collectSentFiles([
      {
        callID: 'call-1',
        content: {
          result: {
            file: 'p3n8x2c7ke',
            name: 'revenue.png',
            bytes: 48_213,
            mediaType: 'image/png',
          },
        },
        input: { file: 'p3n8x2c7ke', caption: 'Revenue by region' },
        outcome: 'result',
        tool: 'file.send',
      },
    ]),
  ).toStrictEqual([
    {
      callID: 'call-1',
      file: 'p3n8x2c7ke',
      name: 'revenue.png',
      bytes: 48_213,
      mediaType: 'image/png',
      caption: 'Revenue by region',
    },
  ]);
});

test('it reads a sent file with no caption', () => {
  expect(
    collectSentFiles([
      {
        callID: 'call-1',
        content: {
          result: { file: 'p3n8x2c7ke', name: 'orders.csv', bytes: 812, mediaType: 'text/csv' },
        },
        input: { file: 'p3n8x2c7ke' },
        outcome: 'result',
        tool: 'file.send',
      },
    ]),
  ).toStrictEqual([
    { callID: 'call-1', file: 'p3n8x2c7ke', name: 'orders.csv', bytes: 812, mediaType: 'text/csv' },
  ]);
});

test.each([
  {
    case: 'a refused send',
    call: {
      callID: 'call-1',
      content: { message: 'The file p3n8x2c7ke was forgotten.' },
      input: { file: 'p3n8x2c7ke' },
      outcome: 'error',
      tool: 'file.send',
    },
  },
  {
    case: 'a send whose record a forget removed',
    call: { callID: 'call-1', isRemoved: true as const, tool: 'file.send' },
  },
  {
    case: 'a send still waiting for its result',
    call: { callID: 'call-1', input: { file: 'p3n8x2c7ke' }, tool: 'file.send' },
  },
  {
    case: 'a call of another tool',
    call: {
      callID: 'call-1',
      content: {
        result: { file: 'p3n8x2c7ke', name: 'orders.csv', bytes: 812, mediaType: 'text/csv' },
      },
      tool: 'code.run',
    },
  },
])('it reads nothing from $case', (row) => {
  expect(collectSentFiles([row.call])).toStrictEqual([]);
});
