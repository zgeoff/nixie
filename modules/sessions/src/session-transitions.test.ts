import { expect, test } from 'bun:test';
import { canSessionTake } from './can-session-take';
import { pickSessionPosition } from './pick-session-position';
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

test('it opens a new session in place of one whose persona changed, and never resumes it', () => {
  const position = pickSessionPosition({
    marks: {
      isInvalidated: false,
      hasOpening: true,
      openedPersonaHash: 'sha256:persona-a',
      isSummarized: false,
      lastContext: { size: 10_000, window: 100_000 },
    },
    personaHash: 'sha256:persona-b',
    boundary: {
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
    threshold: 0.8,
  });

  expect({
    state: position.state,
    canResume: canSessionTake(position.state, 'resume'),
    canCompact: canSessionTake(position.state, 'compact'),
    opensTo: sessionTransitions[position.state].open,
  }).toStrictEqual({
    state: 'invalidated',
    canResume: false,
    canCompact: false,
    opensTo: 'resumable',
  });
});
