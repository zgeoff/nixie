import { expect, test } from 'bun:test';
import { parsePodWatchLine } from './parse-pod-watch-line';

test('it parses an event for a running pod with no exit', () => {
  expect(parsePodWatchLine('MODIFIED|d3972ccf-beec-49ae-9157-f7b6dfe12000||')).toStrictEqual({
    type: 'MODIFIED',
    uid: 'd3972ccf-beec-49ae-9157-f7b6dfe12000',
    exitCode: null,
    finishedAt: null,
  });
});

test('it parses the exit code and end time of an ended container', () => {
  expect(
    parsePodWatchLine('DELETED|d3972ccf-beec-49ae-9157-f7b6dfe12000|0|2026-10-11T15:59:09Z\n'),
  ).toStrictEqual({
    type: 'DELETED',
    uid: 'd3972ccf-beec-49ae-9157-f7b6dfe12000',
    exitCode: 0,
    finishedAt: new Date('2026-10-11T15:59:09Z'),
  });
});

test('it answers null for a line in another shape', () => {
  expect(parsePodWatchLine('error: the server doesn’t have a resource type "pod"')).toBeNull();
});
