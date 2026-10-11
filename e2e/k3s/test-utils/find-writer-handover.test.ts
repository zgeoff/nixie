import { expect, test } from 'bun:test';
import { findWriterHandover } from './find-writer-handover';

test('it finds the old pod’s epoch and stop and the new pod’s writer start', () => {
  expect(
    findWriterHandover(
      [
        {
          time: new Date('2026-10-11T15:00:00.000Z'),
          event: 'writer.started',
          fields: { epoch: 3 },
        },
        { time: new Date('2026-10-11T15:30:00.000Z'), event: 'stopping', fields: {} },
        { time: new Date('2026-10-11T15:30:01.000Z'), event: 'stopped', fields: {} },
      ],
      [
        {
          time: new Date('2026-10-11T15:30:09.000Z'),
          event: 'writer.started',
          fields: { epoch: 4 },
        },
        { time: new Date('2026-10-11T15:30:09.100Z'), event: 'http.listening', fields: {} },
      ],
    ),
  ).toStrictEqual({
    oldEpoch: 3,
    oldStoppedAt: new Date('2026-10-11T15:30:01.000Z'),
    newEpoch: 4,
    newStartedAt: new Date('2026-10-11T15:30:09.000Z'),
  });
});

test('it leaves the old epoch null when the old pod’s first lines are gone from its log', () => {
  expect(
    findWriterHandover(
      [{ time: new Date('2026-10-11T15:30:01.000Z'), event: 'stopped', fields: {} }],
      [
        {
          time: new Date('2026-10-11T15:30:09.000Z'),
          event: 'writer.started',
          fields: { epoch: 4 },
        },
      ],
    ),
  ).toStrictEqual({
    oldEpoch: null,
    oldStoppedAt: new Date('2026-10-11T15:30:01.000Z'),
    newEpoch: 4,
    newStartedAt: new Date('2026-10-11T15:30:09.000Z'),
  });
});

test('it answers null when the old pod never logged its stop', () => {
  expect(
    findWriterHandover(
      [
        {
          time: new Date('2026-10-11T15:00:00.000Z'),
          event: 'writer.started',
          fields: { epoch: 3 },
        },
      ],
      [
        {
          time: new Date('2026-10-11T15:30:09.000Z'),
          event: 'writer.started',
          fields: { epoch: 4 },
        },
      ],
    ),
  ).toBeNull();
});

test('it answers null when the new pod has not opened the database', () => {
  expect(
    findWriterHandover(
      [
        {
          time: new Date('2026-10-11T15:00:00.000Z'),
          event: 'writer.started',
          fields: { epoch: 3 },
        },
        { time: new Date('2026-10-11T15:30:01.000Z'), event: 'stopped', fields: {} },
      ],
      [{ time: new Date('2026-10-11T15:30:09.000Z'), event: 'start.failed', fields: {} }],
    ),
  ).toBeNull();
});
