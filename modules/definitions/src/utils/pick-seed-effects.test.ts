import { expect, test } from 'bun:test';
import { pickSeedEffects } from './pick-seed-effects';

test('it applies an added effect at once', () => {
  const picked = pickSeedEffects({
    tools: [{ name: 'notes.write', effects: ['write'], destinations: [] }],
    overrides: new Map([['notes.write', { add: ['send'], remove: [] }]]),
  });

  expect(picked).toStrictEqual({
    status: 'applied',
    tools: [{ name: 'notes.write', effects: ['send', 'write'], destinations: [] }],
  });
});

test('it applies a removed effect at once', () => {
  const picked = pickSeedEffects({
    tools: [{ name: 'mail.draft', effects: ['send', 'write'], destinations: [] }],
    overrides: new Map([['mail.draft', { add: [], remove: ['send'] }]]),
  });

  expect(picked).toStrictEqual({
    status: 'applied',
    tools: [{ name: 'mail.draft', effects: ['write'], destinations: [] }],
  });
});

test('it refuses an override of an unknown tool', () => {
  const picked = pickSeedEffects({
    tools: [],
    overrides: new Map([['mail.draft', { add: ['write'], remove: [] }]]),
  });

  expect(picked).toStrictEqual({
    status: 'refused',
    reason: 'an effects override names the unknown tool mail.draft',
  });
});

test('it refuses a remove the code lacks', () => {
  const picked = pickSeedEffects({
    tools: [{ name: 'mail.draft', effects: ['write'], destinations: [] }],
    overrides: new Map([['mail.draft', { add: [], remove: ['send'] }]]),
  });

  expect(picked).toMatchObject({ status: 'refused' });
});
