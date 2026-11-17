import { expect, test } from 'bun:test';
import { buildMandateStatus } from './build-mandate-status';

function setupTest() {
  return {
    facts: {
      start: { kind: 'first' as const },
      openedAt: new Date('2026-10-14T11:50:00Z'),
      times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-14T11:50:00Z') },
      model: 'claude-test-1',
    },
    mandate: {
      mandateID: 'k3m9x2q7ab',
      startedAt: Date.parse('2026-10-14T11:00:00Z'),
      expires: Date.parse('2026-10-14T13:00:00Z'),
      changeIDs: ['change-1'],
      rules: [
        { ruleID: 'k3m9x2q7ab-1', sentence: 'Allow `calendar.respond`.' },
        { ruleID: 'k3m9x2q7ab-2', sentence: 'Allow `calendar.invite`.' },
      ],
    },
  };
}

test('it shows a mandate whose title a forget removed as untitled', async () => {
  const ctx = setupTest();

  const status = buildMandateStatus({
    readActive: () => Promise.resolve([ctx.mandate]),
    readTitles: () => Promise.resolve(new Map([['k3m9x2q7ab', null]])),
  });

  const line = await status.read(ctx.facts);

  expect(line).toStrictEqual({
    value: 1,
    text: 'Active mandates: 1.\n  untitled (mandate k3m9x2q7ab), ends Thu 15 Oct, 00:00, Sydney: Allow `calendar.respond`. Allow `calendar.invite`.',
  });
});

test('it says none when no mandate is in force', async () => {
  const ctx = setupTest();

  const status = buildMandateStatus({
    readActive: () => Promise.resolve([]),
    readTitles: () => Promise.resolve(new Map()),
  });

  const line = await status.read(ctx.facts);

  expect(line).toStrictEqual({
    value: 0,
    text: 'Active mandates: none.',
  });
});

test('it leaves out a mandate whose expiry is at or before the opening', async () => {
  const ctx = setupTest();

  const status = buildMandateStatus({
    readActive: () => Promise.resolve([ctx.mandate]),
    readTitles: () => Promise.resolve(new Map([['k3m9x2q7ab', null]])),
  });

  const line = await status.read({ ...ctx.facts, openedAt: new Date('2026-10-14T13:00:00Z') });

  expect(line).toStrictEqual({ value: 0, text: 'Active mandates: none.' });
});
