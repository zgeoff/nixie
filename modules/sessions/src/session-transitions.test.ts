import { expect, test } from 'bun:test';
import { sessionTransitions } from './session-transitions';

test('it opens each session that cannot resume, and compacts only a session past its threshold', () => {
  expect(sessionTransitions).toStrictEqual({
    fresh: { open: 'resumable' },
    summarized: { open: 'resumable' },
    resumable: { resume: 'resumable' },
    'compaction-due': { compact: 'summarized', resume: 'resumable' },
    invalidated: { open: 'resumable' },
    lost: { open: 'resumable' },
  });
});
