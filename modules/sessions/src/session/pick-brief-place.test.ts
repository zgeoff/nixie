import { expect, test } from 'bun:test';
import { buildTestTaskRun } from '@heynixie/tasks/test-utils';
import { buildMockDefinitionBrief } from '../test-utils/build-mock-definition-brief';
import { buildMockMessageBrief } from '../test-utils/build-mock-message-brief';
import { pickBriefPlace } from './pick-brief-place';

test.each([
  ['a new first session', { kind: 'first' }, 'tide-tables:1', 'preamble'],
  ['a new first session at a later step', { kind: 'first' }, 'tide-tables:4', 'preamble'],
  [
    'a rebuilt session',
    { kind: 'rebuild', reason: 'lost', lostSessionID: null },
    'tide-tables:1',
    'pinned',
  ],
  ['a compacted session', { kind: 'compaction' }, 'tide-tables:4', 'pinned'],
  ['a resumed session at the step that opened the run', null, 'tide-tables:1', 'preamble'],
  ['a resumed session at a later step', null, 'tide-tables:2', 'none'],
] as const)(
  'it places the brief of an uncarried task run for %s',
  (_label, start, stepKey, place) => {
    expect(
      pickBriefPlace({
        brief: buildMockDefinitionBrief(),
        run: buildTestTaskRun(),
        stepKey,
        start,
      }),
    ).toBe(place);
  },
);

test('it places no brief in the first turn of a carried task run in a session it resumes', () => {
  expect(
    pickBriefPlace({
      brief: buildMockDefinitionBrief(),
      run: buildTestTaskRun({ carriesRunID: 'earlier-run' }),
      stepKey: 'tide-tables:1',
      start: null,
    }),
  ).toBe('none');
});

test('it pins the brief of a carried task run in a rebuilt session', () => {
  expect(
    pickBriefPlace({
      brief: buildMockDefinitionBrief(),
      run: buildTestTaskRun({ carriesRunID: 'earlier-run' }),
      stepKey: 'tide-tables:1',
      start: { kind: 'rebuild', reason: 'lost', lostSessionID: null },
    }),
  ).toBe('pinned');
});

test('it places no brief that has no record-less origin', () => {
  expect(
    pickBriefPlace({
      brief: buildMockMessageBrief(),
      run: buildTestTaskRun(),
      stepKey: 'tide-tables:1',
      start: { kind: 'first' },
    }),
  ).toBe('none');
});

test('it places no brief for a step with no open task run', () => {
  expect(
    pickBriefPlace({
      brief: buildMockDefinitionBrief(),
      run: null,
      stepKey: 'tide-tables:1',
      start: { kind: 'first' },
    }),
  ).toBe('none');
});
