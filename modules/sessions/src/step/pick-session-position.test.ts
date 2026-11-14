import { expect, test } from 'bun:test';
import { bindHarness } from '@heynixie/models';
import { buildMockModelProfile, buildStubCodexHarness } from '@heynixie/models/test-utils';
import { sessionPointSchema } from '@heynixie/wire';
import { buildCapabilitiesWithout } from '@heynixie/wire/test-utils';
import { pickSessionPosition } from './pick-session-position';

function setupTest() {
  return {
    agentSDK: bindHarness(buildMockModelProfile()),
    codex: buildStubCodexHarness(),
    point: {
      harness: 'agent-sdk',
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    } as const,
    openedMarks: {
      isInvalidated: false,
      hasOpening: true,
      isBriefUnmarked: false,
      openedPersonaHash: 'sha256:persona-a',
      isSummarized: false,
      lastContext: { size: 79_000, window: 100_000 },
    },
  };
}

test('it reads a task that never opened a session as fresh', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: false,
        isBriefUnmarked: false,
        openedPersonaHash: null,
        isSummarized: false,
        lastContext: null,
      },
      boundary: null,
      personaHash: 'sha256:persona-a',
      isTask: false,
      session: ctx.agentSDK.session,
      capabilities: ctx.agentSDK.capabilities,
      threshold: 0.8,
    }),
  ).toStrictEqual({ state: 'fresh', boundary: null });
});

test('it reads a session with a summary after its last opening as summarized', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: true,
        isBriefUnmarked: false,
        openedPersonaHash: null,
        isSummarized: true,
        lastContext: null,
      },
      boundary: null,
      personaHash: 'sha256:persona-a',
      isTask: false,
      session: ctx.agentSDK.session,
      capabilities: ctx.agentSDK.capabilities,
      threshold: 0.8,
    }),
  ).toStrictEqual({ state: 'summarized', boundary: null });
});

test('it reads an opened session at its boundary under the threshold as resumable', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: true,
        isBriefUnmarked: false,
        openedPersonaHash: 'sha256:persona-a',
        isSummarized: false,
        lastContext: { size: 79_000, window: 100_000 },
      },
      boundary: {
        harness: 'agent-sdk',
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      personaHash: 'sha256:persona-a',
      isTask: false,
      session: ctx.agentSDK.session,
      capabilities: ctx.agentSDK.capabilities,
      threshold: 0.8,
    }),
  ).toStrictEqual({
    state: 'resumable',
    boundary: {
      harness: 'agent-sdk',
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
  });
});

test('it reads an opened session at its boundary past the threshold as due for compaction', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: true,
        isBriefUnmarked: false,
        openedPersonaHash: 'sha256:persona-a',
        isSummarized: false,
        lastContext: { size: 80_000, window: 100_000 },
      },
      boundary: {
        harness: 'agent-sdk',
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      personaHash: 'sha256:persona-a',
      isTask: false,
      session: ctx.agentSDK.session,
      capabilities: ctx.agentSDK.capabilities,
      threshold: 0.8,
    }),
  ).toStrictEqual({
    state: 'compaction-due',
    boundary: {
      harness: 'agent-sdk',
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
  });
});

test('it reads a session that a forget invalidated as invalidated, past the threshold too', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: true,
        hasOpening: true,
        isBriefUnmarked: false,
        openedPersonaHash: 'sha256:persona-a',
        isSummarized: false,
        lastContext: { size: 90_000, window: 100_000 },
      },
      boundary: {
        harness: 'agent-sdk',
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      personaHash: 'sha256:persona-a',
      isTask: false,
      session: ctx.agentSDK.session,
      capabilities: ctx.agentSDK.capabilities,
      threshold: 0.8,
    }),
  ).toStrictEqual({
    state: 'invalidated',
    boundary: {
      harness: 'agent-sdk',
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
    cause: 'forget',
  });
});

test('it reads a forget with no session open as invalidated', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: true,
        hasOpening: false,
        isBriefUnmarked: false,
        openedPersonaHash: null,
        isSummarized: false,
        lastContext: null,
      },
      boundary: null,
      personaHash: 'sha256:persona-a',
      isTask: false,
      session: ctx.agentSDK.session,
      capabilities: ctx.agentSDK.capabilities,
      threshold: 0.8,
    }),
  ).toStrictEqual({ state: 'invalidated', boundary: null, cause: 'forget' });
});

test('it reads a boundary from before opening records as lost', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: false,
        isBriefUnmarked: false,
        openedPersonaHash: null,
        isSummarized: false,
        lastContext: null,
      },
      boundary: {
        harness: 'agent-sdk',
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      personaHash: 'sha256:persona-a',
      isTask: false,
      session: ctx.agentSDK.session,
      capabilities: ctx.agentSDK.capabilities,
      threshold: 0.8,
    }),
  ).toStrictEqual({
    state: 'lost',
    boundary: {
      harness: 'agent-sdk',
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
  });
});

test('it reads an opened session under another persona as invalidated by the persona, past the threshold too', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: true,
        isBriefUnmarked: false,
        openedPersonaHash: 'sha256:persona-a',
        isSummarized: false,
        lastContext: { size: 90_000, window: 100_000 },
      },
      personaHash: 'sha256:persona-b',
      isTask: false,
      boundary: {
        harness: 'agent-sdk',
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      session: ctx.agentSDK.session,
      capabilities: ctx.agentSDK.capabilities,
      threshold: 0.8,
    }),
  ).toStrictEqual({
    state: 'invalidated',
    boundary: {
      harness: 'agent-sdk',
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
    cause: 'persona',
  });
});

test('it reads a session that a forget invalidated under another persona as invalidated by the forget', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: true,
        hasOpening: true,
        isBriefUnmarked: false,
        openedPersonaHash: 'sha256:persona-a',
        isSummarized: false,
        lastContext: null,
      },
      personaHash: 'sha256:persona-b',
      isTask: false,
      boundary: {
        harness: 'agent-sdk',
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      session: ctx.agentSDK.session,
      capabilities: ctx.agentSDK.capabilities,
      threshold: 0.8,
    }),
  ).toStrictEqual({
    state: 'invalidated',
    boundary: {
      harness: 'agent-sdk',
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
    cause: 'forget',
  });
});

test('it reads a session opened before openings kept the persona hash as resumable', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: true,
        isBriefUnmarked: false,
        openedPersonaHash: null,
        isSummarized: false,
        lastContext: null,
      },
      personaHash: 'sha256:persona-b',
      isTask: false,
      boundary: {
        harness: 'agent-sdk',
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      session: ctx.agentSDK.session,
      capabilities: ctx.agentSDK.capabilities,
      threshold: 0.8,
    }),
  ).toStrictEqual({
    state: 'resumable',
    boundary: {
      harness: 'agent-sdk',
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
  });
});

test('it reads the session of a started task as lost when its opening kept no brief mark, so the next step rebuilds it', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: true,
        isBriefUnmarked: true,
        openedPersonaHash: null,
        isSummarized: false,
        lastContext: null,
      },
      boundary: {
        harness: 'agent-sdk',
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      personaHash: 'sha256:persona-a',
      isTask: true,
      session: ctx.agentSDK.session,
      capabilities: ctx.agentSDK.capabilities,
      threshold: 0.8,
    }),
  ).toStrictEqual({
    state: 'lost',
    boundary: {
      harness: 'agent-sdk',
      sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
      messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
    },
  });
});

test('it leaves the session of the conversation resumable when its opening kept no brief mark', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: {
        isInvalidated: false,
        hasOpening: true,
        isBriefUnmarked: true,
        openedPersonaHash: null,
        isSummarized: false,
        lastContext: null,
      },
      boundary: {
        harness: 'agent-sdk',
        sessionID: '5d0c8f3e-2a41-4c6b-9f7e-1b2d3c4e5f60',
        messageID: '8a9b0c1d-2e3f-4a5b-8c7d-9e0f1a2b3c4d',
      },
      personaHash: 'sha256:persona-a',
      isTask: false,
      session: ctx.agentSDK.session,
      capabilities: ctx.agentSDK.capabilities,
      threshold: 0.8,
    }),
  ).toMatchObject({ state: 'resumable' });
});

test('it reads the first step of a task on a harness with no session as fresh', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: { ...ctx.openedMarks, hasOpening: false, openedPersonaHash: null, lastContext: null },
      boundary: null,
      session: ctx.codex.session,
      capabilities: ctx.codex.capabilities,
      personaHash: 'sha256:persona-a',
      isTask: true,
      threshold: 0.8,
    }),
  ).toStrictEqual({ state: 'fresh', boundary: null });
});

test('it reads a later step of a task on a harness with no session as unkept, with no point stored', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: ctx.openedMarks,
      boundary: null,
      session: ctx.codex.session,
      capabilities: ctx.codex.capabilities,
      personaHash: 'sha256:persona-a',
      isTask: true,
      threshold: 0.8,
    }),
  ).toStrictEqual({ state: 'unkept', boundary: null });
});

test('it reads a later step of a task on a harness with no session as unkept, whatever point is stored', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: ctx.openedMarks,
      boundary: ctx.point,
      session: ctx.codex.session,
      capabilities: ctx.codex.capabilities,
      personaHash: 'sha256:persona-a',
      isTask: true,
      threshold: 0.8,
    }),
  ).toStrictEqual({ state: 'unkept', boundary: null });
});

test('it reads a later step on a harness with no session as invalidated when the persona changed', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: ctx.openedMarks,
      boundary: null,
      session: ctx.codex.session,
      capabilities: ctx.codex.capabilities,
      personaHash: 'sha256:persona-b',
      isTask: true,
      threshold: 0.8,
    }),
  ).toStrictEqual({ state: 'invalidated', boundary: null, cause: 'persona' });
});

test('it reads a later step on a harness with no session as invalidated when a forget cleared it', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: { ...ctx.openedMarks, isInvalidated: true },
      boundary: ctx.point,
      session: ctx.codex.session,
      capabilities: ctx.codex.capabilities,
      personaHash: 'sha256:persona-a',
      isTask: true,
      threshold: 0.8,
    }),
  ).toStrictEqual({ state: 'invalidated', boundary: null, cause: 'forget' });
});

test('it reads a stored point with no harness key as resumable on the Agent SDK', () => {
  const ctx = setupTest();

  const stored = sessionPointSchema.parse({
    sessionID: ctx.point.sessionID,
    messageID: ctx.point.messageID,
  });

  expect(
    pickSessionPosition({
      marks: ctx.openedMarks,
      boundary: stored,
      session: ctx.agentSDK.session,
      capabilities: ctx.agentSDK.capabilities,
      personaHash: 'sha256:persona-a',
      isTask: false,
      threshold: 0.8,
    }),
  ).toStrictEqual({ state: 'resumable', boundary: ctx.point });
});

test('it reads an Agent SDK task with an opening and no point as unkept', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: ctx.openedMarks,
      boundary: null,
      session: ctx.agentSDK.session,
      capabilities: ctx.agentSDK.capabilities,
      personaHash: 'sha256:persona-a',
      isTask: true,
      threshold: 0.8,
    }),
  ).toStrictEqual({ state: 'unkept', boundary: null });
});

test('it reads a session past its threshold as resumable on a harness that declares no summarize', () => {
  const ctx = setupTest();

  expect(
    pickSessionPosition({
      marks: { ...ctx.openedMarks, lastContext: { size: 95_000, window: 100_000 } },
      boundary: ctx.point,
      session: ctx.agentSDK.session,
      capabilities: buildCapabilitiesWithout('summarize'),
      personaHash: 'sha256:persona-a',
      isTask: false,
      threshold: 0.8,
    }),
  ).toStrictEqual({ state: 'resumable', boundary: ctx.point });
});
