import { expect, test } from 'bun:test';
import { toSessionDefinitions } from './to-session-definitions';

test('it reads the persona, its hash and the policy hash from the definitions in force', () => {
  expect(
    toSessionDefinitions({
      seededAt: new Date('2026-10-14T09:00:00Z'),
      sourceID: 'path:/srv/definitions',
      sourceKind: 'path',
      revision: 'sha256:content',
      contentHash: 'sha256:content',
      formatVersion: 1,
      snapshotHash: 'sha256:snapshot',
      personaVersion: 'sha256:persona-wren',
      persona: 'You are Wren, a calm helper.',
      policyHash: 'sha256:policy-read-only',
      recordSequence: 3,
      skills: [],
    }),
  ).toStrictEqual({
    persona: 'You are Wren, a calm helper.',
    personaHash: 'sha256:persona-wren',
    policyHash: 'sha256:policy-read-only',
  });
});

test('it reads empty definitions before the first seed', () => {
  expect(toSessionDefinitions(null)).toStrictEqual({
    persona: '',
    personaHash: '',
    policyHash: '',
  });
});
