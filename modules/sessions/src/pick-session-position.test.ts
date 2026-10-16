import { expect, test } from 'bun:test';
import { pickSessionPosition } from './pick-session-position';

test('it reads a task that never opened a session as fresh', () => {
  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: false,
        openedPersonaHash: null,
        isSummarized: false,
        lastContext: null,
      },
      boundary: null,
      personaHash: 'sha256:persona-a',
      threshold: 0.8,
    }),
  ).toStrictEqual({ state: 'fresh', boundary: null });
});

test('it reads a session with a summary after its last opening as summarized', () => {
  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: true,
        openedPersonaHash: null,
        isSummarized: true,
        lastContext: null,
      },
      boundary: null,
      personaHash: 'sha256:persona-a',
      threshold: 0.8,
    }),
  ).toStrictEqual({ state: 'summarized', boundary: null });
});

test('it reads an opened session at its boundary under the threshold as resumable', () => {
  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: true,
        openedPersonaHash: 'sha256:persona-a',
        isSummarized: false,
        lastContext: { size: 79_000, window: 100_000 },
      },
      boundary: {
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      personaHash: 'sha256:persona-a',
      threshold: 0.8,
    }),
  ).toStrictEqual({
    state: 'resumable',
    boundary: {
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
  });
});

test('it reads an opened session at its boundary past the threshold as due for compaction', () => {
  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: true,
        openedPersonaHash: 'sha256:persona-a',
        isSummarized: false,
        lastContext: { size: 80_000, window: 100_000 },
      },
      boundary: {
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      personaHash: 'sha256:persona-a',
      threshold: 0.8,
    }),
  ).toStrictEqual({
    state: 'compaction-due',
    boundary: {
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
  });
});

test('it reads a session that a forget invalidated as invalidated, past the threshold too', () => {
  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: true,
        hasOpening: true,
        openedPersonaHash: 'sha256:persona-a',
        isSummarized: false,
        lastContext: { size: 90_000, window: 100_000 },
      },
      boundary: {
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      personaHash: 'sha256:persona-a',
      threshold: 0.8,
    }),
  ).toStrictEqual({
    state: 'invalidated',
    boundary: {
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
    cause: 'forget',
  });
});

test('it reads a forget with no session open as invalidated', () => {
  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: true,
        hasOpening: false,
        openedPersonaHash: null,
        isSummarized: false,
        lastContext: null,
      },
      boundary: null,
      personaHash: 'sha256:persona-a',
      threshold: 0.8,
    }),
  ).toStrictEqual({ state: 'invalidated', boundary: null, cause: 'forget' });
});

test('it reads a boundary from before opening records as lost', () => {
  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: false,
        openedPersonaHash: null,
        isSummarized: false,
        lastContext: null,
      },
      boundary: {
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      personaHash: 'sha256:persona-a',
      threshold: 0.8,
    }),
  ).toStrictEqual({
    state: 'lost',
    boundary: {
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
  });
});

test('it reads an opened session under another persona as invalidated by the persona, past the threshold too', () => {
  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: true,
        openedPersonaHash: 'sha256:persona-a',
        isSummarized: false,
        lastContext: { size: 90_000, window: 100_000 },
      },
      personaHash: 'sha256:persona-b',
      boundary: {
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      threshold: 0.8,
    }),
  ).toStrictEqual({
    state: 'invalidated',
    boundary: {
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
    cause: 'persona',
  });
});

test('it reads a session that a forget invalidated under another persona as invalidated by the forget', () => {
  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: true,
        hasOpening: true,
        openedPersonaHash: 'sha256:persona-a',
        isSummarized: false,
        lastContext: null,
      },
      personaHash: 'sha256:persona-b',
      boundary: {
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      threshold: 0.8,
    }),
  ).toStrictEqual({
    state: 'invalidated',
    boundary: {
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
    cause: 'forget',
  });
});

test('it reads a session opened before openings kept the persona hash as resumable', () => {
  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: true,
        openedPersonaHash: null,
        isSummarized: false,
        lastContext: null,
      },
      personaHash: 'sha256:persona-b',
      boundary: {
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      threshold: 0.8,
    }),
  ).toStrictEqual({
    state: 'resumable',
    boundary: {
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
  });
});
