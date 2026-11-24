import { expect, test } from 'bun:test';
import type { ComputerReply } from '@heynixie/wire';
import { buildTabs } from '../build-tabs';
import type { CallResult } from '../types';
import { makeGuestHooks } from './make-guest-hooks';

function setupTest() {
  const state = { tabs: new Map<string, string>(), tabCount: 0, idleClosed: new Set<string>() };
  const tabs = buildTabs(state);
  const answer: { reply: ComputerReply | null } = { reply: null };

  const hooks = makeGuestHooks({
    hasGuest: () => true,
    runHoldCall: () => {
      const reply = answer.reply;

      const result: CallResult =
        reply === null ? { status: 'busy' } : { status: 'reply', reply, refusal: null };

      return Promise.resolve(result);
    },
    tabs,
  });

  return { state, tabs, answer, hooks };
}

test('it names every tab the guest lists, adopting those the model has no name for', async () => {
  const ctx = setupTest();
  const known = ctx.tabs.add('g1');

  ctx.answer.reply = {
    kind: 'takeover-ended',
    ok: true,
    origins: [],
    isRestarted: false,
    tabs: [
      { tab: 'g1', origin: 'https://itch.io' },
      { tab: 'g2', origin: 'https://accounts.itch.io' },
      { tab: 'g3', origin: null },
    ],
    now: { kind: 'other', title: '' },
  };

  const read = await ctx.hooks.finish();

  expect([known, read?.tabs]).toStrictEqual([
    't1',
    [
      { tab: 't1', origin: 'https://itch.io' },
      { tab: 't2', origin: 'https://accounts.itch.io' },
      { tab: 't3', origin: null },
    ],
  ]);
});

test('it forgets the tabs of a browser that restarted and names the ones it has now', async () => {
  const ctx = setupTest();

  ctx.tabs.add('g1');

  ctx.answer.reply = {
    kind: 'takeover-ended',
    ok: true,
    origins: [],
    isRestarted: true,
    tabs: [{ tab: 'g1', origin: 'https://itch.io' }],
    now: { kind: 'other', title: '' },
  };

  const read = await ctx.hooks.finish();

  expect([read?.isRestarted, read?.tabs, [...ctx.state.tabs]]).toStrictEqual([
    true,
    [{ tab: 't2', origin: 'https://itch.io' }],
    [['t2', 'g1']],
  ]);
});
