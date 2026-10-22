import { machineTypes } from '@zgeoff/std';
import { assign, setup } from 'xstate';
import type { RetiredForgetItem } from './types';
import type { RetiredForgetInput } from './use-retired-forget';

interface RetiredForgetContext {
  readonly items: readonly RetiredForgetItem[] | null;
  readonly selected: ReadonlySet<string>;
  readonly sent: RetiredForgetInput | null;
}

type RetiredForgetEvent =
  | { readonly type: 'open' }
  | { readonly type: 'preview.read'; readonly items: readonly RetiredForgetItem[] }
  | { readonly type: 'toggle'; readonly itemID: string; readonly isChecked: boolean }
  | { readonly type: 'select.all' }
  | { readonly type: 'select.none' }
  | { readonly type: 'cancel' }
  | { readonly type: 'send'; readonly clientActionID: string }
  | { readonly type: 'applied' }
  | { readonly type: 'refused' }
  | { readonly type: 'failed' }
  | { readonly type: 'retry' };

interface RetiredForgetMachineInput {
  readonly unfinished: RetiredForgetInput | null;
}

const closedContext: RetiredForgetContext = { items: null, selected: new Set(), sent: null };

export const retiredForgetMachine = setup({
  types: machineTypes<{
    input: RetiredForgetMachineInput;
    context: RetiredForgetContext;
    events: RetiredForgetEvent;
  }>(),
}).createMachine({
  id: 'retiredForget',
  context: (start) => ({ ...closedContext, sent: start.input.unfinished }),
  initial: 'idle',
  states: {
    // A call that failed before this page mounted still offers its finish.
    idle: {
      always: { guard: (state) => state.context.sent !== null, target: 'failed' },
      on: { open: { target: 'confirming' } },
    },
    confirming: {
      on: {
        // The confirmation binds to the set the preview first showed, so a later read never swaps
        // it for the items still retired.
        'preview.read': {
          guard: (read) => read.context.items === null,
          actions: assign((read) => ({
            items: read.event.items,
            selected: new Set(read.event.items.map((item) => item.itemID)),
          })),
        },
        toggle: {
          actions: assign((toggled) => ({
            selected: toggleItem(
              toggled.context.selected,
              toggled.event.itemID,
              toggled.event.isChecked,
            ),
          })),
        },
        'select.all': {
          actions: assign((chosen) => ({
            selected: new Set((chosen.context.items ?? []).map((item) => item.itemID)),
          })),
        },
        'select.none': { actions: assign({ selected: new Set<string>() }) },
        cancel: { target: 'idle', actions: assign(closedContext) },
        send: {
          guard: (sending) => sending.context.selected.size > 0,
          target: 'sent',
          actions: assign((sending) => ({
            sent: {
              clientActionID: sending.event.clientActionID,
              targets: (sending.context.items ?? [])
                .filter((item) => sending.context.selected.has(item.itemID))
                .map((item) => ({ itemID: item.itemID, version: item.version })),
            },
          })),
        },
      },
    },
    sent: {
      on: {
        applied: { target: 'done', actions: assign(closedContext) },
        refused: { target: 'idle', actions: assign(closedContext) },
        failed: { target: 'failed' },
      },
    },
    failed: {
      on: { retry: { target: 'sent' } },
    },
    done: {
      on: { open: { target: 'confirming' } },
    },
  },
});

function toggleItem(
  selected: ReadonlySet<string>,
  itemID: string,
  isChecked: boolean,
): ReadonlySet<string> {
  const next = new Set(selected);

  if (isChecked) {
    next.add(itemID);
  } else {
    next.delete(itemID);
  }

  return next;
}
