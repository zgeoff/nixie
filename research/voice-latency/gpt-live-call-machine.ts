// GPT-Live sends no event when it stops speaking, so a turn ends after a quiet spell. Only sound
// after the last delegated answer counts, because GPT-Live speaks a filler before the answer.
import { machineTypes } from '@zgeoff/std';
import { assign, setup } from 'xstate';

interface GptLiveCallContext {
  error: unknown;
  pending: number;
  quietMs: number;
}

export type GptLiveCallEvent =
  | { type: 'answered' }
  | { type: 'delegated' }
  | { error: unknown; type: 'failed' }
  | { type: 'opened' }
  | { type: 'sound' };

export const gptLiveCallMachine = setup({
  types: machineTypes<{
    context: GptLiveCallContext;
    events: GptLiveCallEvent;
    input: { quietMs: number };
  }>(),
  delays: {
    quiet: (delay) => delay.context.quietMs,
  },
  guards: {
    isNothingPending: (guard) => guard.context.pending === 0,
  },
}).createMachine({
  id: 'gptLiveCall',
  context: (start) => ({ error: undefined, pending: 0, quietMs: start.input.quietMs }),
  initial: 'opening',
  on: {
    failed: { actions: assign({ error: (failed) => failed.event.error }), target: '.failed' },
  },
  states: {
    opening: {
      on: { opened: { target: 'waiting' } },
    },
    // No sound yet that can end the turn: the call has just opened, or a delegated answer arrived
    // and GPT-Live has not spoken it.
    waiting: {
      on: {
        answered: { actions: assign({ pending: (answered) => answered.context.pending - 1 }) },
        delegated: { actions: assign({ pending: (delegated) => delegated.context.pending + 1 }) },
        sound: { target: 'speaking' },
      },
    },
    speaking: {
      after: {
        quiet: { guard: 'isNothingPending', target: 'ended' },
      },
      on: {
        answered: {
          actions: assign({ pending: (answered) => answered.context.pending - 1 }),
          target: 'waiting',
        },
        delegated: { actions: assign({ pending: (delegated) => delegated.context.pending + 1 }) },
        sound: { reenter: true, target: 'speaking' },
      },
    },
    ended: { type: 'final' },
    failed: { type: 'final' },
  },
});
