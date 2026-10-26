import { expect, mock, test } from 'bun:test';
import { buildLedgerWriter } from './build-ledger-writer.ts';
import { ledgerKeys } from './ledger-keys.ts';
import type { CheckLine, CheckRecord } from './types.ts';

function setupTest() {
  return { appendLine: mock<(line: CheckLine) => Promise<void>>(() => Promise.resolve()) };
}

test('it appends a settlement, a new reservation and a record for a call a crash left reserved', async () => {
  const ctx = setupTest();

  const writer = buildLedgerWriter<CheckRecord>({
    open: [{ reservedFor: 'case 2/3', reserveUSD: 0.25 }],
    keyOf: ledgerKeys.check,
    appendLine: ctx.appendLine,
  });

  await writer.appendSettlement({ settledFor: 'case 2/3', settledUSD: 0.25 });
  await writer.appendReservation({ reservedFor: 'case 2/3', reserveUSD: 0.25 });

  await writer.appendRecord({
    caseID: '2/3',
    bucket: 'natural',
    tool: 'web_fetch',
    model: 'claude-sonnet-5-5',
    effort: 'high',
    promptSHA256: 'hash-a',
    inputSHA256: 'hash-i',
    verdict: 'asserted',
    reason: 'the user asked for the bus times',
    failure: null,
    costUSD: 0.125,
  });

  expect(ctx.appendLine.mock.calls).toStrictEqual([
    [{ settledFor: 'case 2/3', settledUSD: 0.25 }],
    [{ reservedFor: 'case 2/3', reserveUSD: 0.25 }],
    [
      {
        caseID: '2/3',
        bucket: 'natural',
        tool: 'web_fetch',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: 'hash-i',
        verdict: 'asserted',
        reason: 'the user asked for the bus times',
        failure: null,
        costUSD: 0.125,
      },
    ],
  ]);
});

test('it refuses a second reservation for a call whose reservation is open, and appends nothing', () => {
  const ctx = setupTest();

  const writer = buildLedgerWriter<CheckRecord>({
    open: [{ reservedFor: 'case 2/3', reserveUSD: 0.25 }],
    keyOf: ledgerKeys.check,
    appendLine: ctx.appendLine,
  });

  expect(writer.appendReservation({ reservedFor: 'case 2/3', reserveUSD: 0.25 })).rejects.toThrow(
    'the reservation for case 2/3 cannot move from reserved to reserved',
  );

  expect(ctx.appendLine).not.toHaveBeenCalled();
});

test('it refuses a second settlement of one reservation, and appends only the first', async () => {
  const ctx = setupTest();

  const writer = buildLedgerWriter<CheckRecord>({
    open: [{ reservedFor: 'case 2/3', reserveUSD: 0.25 }],
    keyOf: ledgerKeys.check,
    appendLine: ctx.appendLine,
  });

  await writer.appendSettlement({ settledFor: 'case 2/3', settledUSD: 0.25 });

  expect(writer.appendSettlement({ settledFor: 'case 2/3', settledUSD: 0.25 })).rejects.toThrow(
    'the reservation for case 2/3 cannot move from settled to settled',
  );

  expect(ctx.appendLine.mock.calls).toStrictEqual([[{ settledFor: 'case 2/3', settledUSD: 0.25 }]]);
});

test('it refuses the record of a call whose reservation a settlement already settled', async () => {
  const ctx = setupTest();

  const writer = buildLedgerWriter<CheckRecord>({
    open: [{ reservedFor: 'case 2/3', reserveUSD: 0.25 }],
    keyOf: ledgerKeys.check,
    appendLine: ctx.appendLine,
  });

  await writer.appendSettlement({ settledFor: 'case 2/3', settledUSD: 0.25 });

  expect(
    writer.appendRecord({
      caseID: '2/3',
      bucket: 'natural',
      tool: 'web_fetch',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      promptSHA256: 'hash-a',
      inputSHA256: 'hash-i',
      verdict: 'asserted',
      reason: 'the user asked for the bus times',
      failure: null,
      costUSD: 0.125,
    }),
  ).rejects.toThrow('the reservation for case 2/3 cannot move from settled to settled');

  expect(ctx.appendLine.mock.calls).toStrictEqual([[{ settledFor: 'case 2/3', settledUSD: 0.25 }]]);
});

test('it refuses a settlement for a call that holds no reservation, and appends nothing', () => {
  const ctx = setupTest();

  const writer = buildLedgerWriter<CheckRecord>({
    open: [],
    keyOf: ledgerKeys.check,
    appendLine: ctx.appendLine,
  });

  expect(writer.appendSettlement({ settledFor: 'case 2/3', settledUSD: 0.25 })).rejects.toThrow(
    'the reservation for case 2/3 cannot settle, because no reservation holds it',
  );

  expect(ctx.appendLine).not.toHaveBeenCalled();
});

test('it refuses the record of a call that holds no reservation, and appends nothing', () => {
  const ctx = setupTest();

  const writer = buildLedgerWriter<CheckRecord>({
    open: [],
    keyOf: ledgerKeys.check,
    appendLine: ctx.appendLine,
  });

  expect(
    writer.appendRecord({
      caseID: '2/3',
      bucket: 'natural',
      tool: 'web_fetch',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      promptSHA256: 'hash-a',
      inputSHA256: 'hash-i',
      verdict: 'asserted',
      reason: 'the user asked for the bus times',
      failure: null,
      costUSD: 0.125,
    }),
  ).rejects.toThrow('the reservation for case 2/3 cannot settle, because no reservation holds it');

  expect(ctx.appendLine).not.toHaveBeenCalled();
});
