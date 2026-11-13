import { expect, test } from 'bun:test';
import { pickSeedEffects } from './pick-seed-effects';

test('it applies an added effect at once', () => {
  const picked = pickSeedEffects({
    tools: [{ name: 'notes.write', effects: ['write'], destinations: [] }],
    overrides: new Map([['notes.write', { add: ['send'], remove: [] }]]),
    inForce: new Map([['notes.write', ['write']]]),
    approved: new Set(),
  });

  expect(picked).toStrictEqual({
    status: 'applied',
    tools: [{ name: 'notes.write', effects: ['send', 'write'], destinations: [] }],
    held: [],
  });
});

test('it holds a removed effect until you approve it', () => {
  const picked = pickSeedEffects({
    tools: [{ name: 'mail.draft', effects: ['send', 'write'], destinations: [] }],
    overrides: new Map([['mail.draft', { add: [], remove: ['send'] }]]),
    inForce: new Map([['mail.draft', ['send', 'write']]]),
    approved: new Set(),
  });

  expect(picked).toStrictEqual({
    status: 'applied',
    tools: [{ name: 'mail.draft', effects: ['send', 'write'], destinations: [] }],
    held: [{ tool: 'mail.draft', remove: ['send'] }],
  });
});

test('it applies a removed effect once you approved it', () => {
  const picked = pickSeedEffects({
    tools: [{ name: 'mail.draft', effects: ['send', 'write'], destinations: [] }],
    overrides: new Map([['mail.draft', { add: [], remove: ['send'] }]]),
    inForce: new Map([['mail.draft', ['send', 'write']]]),
    approved: new Set(['mail.draft:send']),
  });

  expect(picked).toStrictEqual({
    status: 'applied',
    tools: [{ name: 'mail.draft', effects: ['write'], destinations: [] }],
    held: [],
  });
});

test('it applies a removal at the first seed, which holds no widening', () => {
  const picked = pickSeedEffects({
    tools: [{ name: 'mail.draft', effects: ['send', 'write'], destinations: [] }],
    overrides: new Map([['mail.draft', { add: [], remove: ['send'] }]]),
    inForce: null,
    approved: new Set(),
  });

  expect(picked).toMatchObject({ status: 'applied', held: [] });
});

test('it refuses an override of an unknown tool', () => {
  const picked = pickSeedEffects({
    tools: [],
    overrides: new Map([['mail.draft', { add: ['write'], remove: [] }]]),
    inForce: null,
    approved: new Set(),
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
    inForce: null,
    approved: new Set(),
  });

  expect(picked).toMatchObject({ status: 'refused' });
});
