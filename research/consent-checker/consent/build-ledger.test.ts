import { expect, test } from 'bun:test';
import { buildLedger } from './build-ledger.ts';

test('it replaces a reservation with the cost of the record that settles it', () => {
  expect(
    buildLedger(
      [
        { reservedFor: 'case 2/3', reserveUSD: 0.25 },
        { caseID: '2/3', costUSD: 0.125 },
      ],
      (record) => `case ${record.caseID}`,
    ),
  ).toStrictEqual({ records: [{ caseID: '2/3', costUSD: 0.125 }], spentUSD: 0.125, open: [] });
});

test('it counts in full and lists a reservation that a crash left with no record', () => {
  expect(
    buildLedger(
      [
        { reservedFor: 'case 2/3', reserveUSD: 0.25 },
        { reservedFor: 'case 2/4', reserveUSD: 0.25 },
        { caseID: '2/3', costUSD: 0.125 },
      ],
      (record) => `case ${record.caseID}`,
    ),
  ).toStrictEqual({
    records: [{ caseID: '2/3', costUSD: 0.125 }],
    spentUSD: 0.375,
    open: [{ reservedFor: 'case 2/4', reserveUSD: 0.25 }],
  });
});

test('it keeps the reservation of a failed call with no known cost', () => {
  expect(
    buildLedger(
      [
        { reservedFor: 'case 2/3', reserveUSD: 0.25 },
        { caseID: '2/3', costUSD: null },
      ],
      (record) => `case ${record.caseID}`,
    ),
  ).toStrictEqual({ records: [{ caseID: '2/3', costUSD: null }], spentUSD: 0.25, open: [] });
});

test('it closes a reservation that a settlement settles and counts the settled amount', () => {
  expect(
    buildLedger(
      [
        { reservedFor: 'case 2/3', reserveUSD: 0.25 },
        { settledFor: 'case 2/3', settledUSD: 0.25 },
        { caseID: '2/4', costUSD: 0.125 },
      ],
      (record) => `case ${record.caseID}`,
    ),
  ).toStrictEqual({ records: [{ caseID: '2/4', costUSD: 0.125 }], spentUSD: 0.375, open: [] });
});

test('it counts both the settled reservation a crash left and the rerun of the same call', () => {
  expect(
    buildLedger(
      [
        { reservedFor: 'case 2/3', reserveUSD: 0.25 },
        { settledFor: 'case 2/3', settledUSD: 0.25 },
        { reservedFor: 'case 2/3', reserveUSD: 0.25 },
        { caseID: '2/3', costUSD: 0.125 },
      ],
      (record) => `case ${record.caseID}`,
    ),
  ).toStrictEqual({ records: [{ caseID: '2/3', costUSD: 0.125 }], spentUSD: 0.375, open: [] });
});

test('it counts both reservations when a rerun reserved the same call again with no settlement', () => {
  expect(
    buildLedger(
      [
        { reservedFor: 'case 2/3', reserveUSD: 0.25 },
        { reservedFor: 'case 2/3', reserveUSD: 0.25 },
        { caseID: '2/3', costUSD: 0.125 },
      ],
      (record) => `case ${record.caseID}`,
    ),
  ).toStrictEqual({ records: [{ caseID: '2/3', costUSD: 0.125 }], spentUSD: 0.375, open: [] });
});

test('it counts the cost of a record that no reservation came before', () => {
  expect(
    buildLedger([{ caseID: '2/3', costUSD: 0.125 }], (record) => `case ${record.caseID}`),
  ).toStrictEqual({ records: [{ caseID: '2/3', costUSD: 0.125 }], spentUSD: 0.125, open: [] });
});
