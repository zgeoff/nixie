import { machineTypes } from '@zgeoff/std';
import { setup } from 'xstate';

type MicrophoneAccessEvent =
  | { readonly type: 'unavailable' }
  | { readonly type: 'permission.read'; readonly state: PermissionState | null }
  | { readonly type: 'permission.changed'; readonly state: PermissionState }
  | { readonly type: 'request' }
  | { readonly type: 'request.granted' }
  | { readonly type: 'request.refused'; readonly state: PermissionState | null }
  | { readonly type: 'request.failed' };

export const microphoneAccessMachine = setup({
  types: machineTypes<{ events: MicrophoneAccessEvent }>(),
}).createMachine({
  id: 'microphoneAccess',
  initial: 'checking',
  on: {
    // Chrome reports a change made in the site settings at any time, and the change decides the
    // state over the answer to a request still open.
    'permission.changed': [
      { guard: (changed) => changed.event.state === 'granted', target: '.on' },
      { guard: (changed) => changed.event.state === 'prompt', target: '.not-asked' },
      { target: '.blocked' },
    ],
  },
  states: {
    checking: {
      on: {
        unavailable: { target: 'unavailable' },
        'permission.read': [
          { guard: (read) => read.event.state === 'granted', target: 'on' },
          { guard: (read) => read.event.state === 'denied', target: 'blocked' },
          { target: 'not-asked' },
        ],
      },
    },
    'not-asked': {
      on: { request: { target: 'asking' } },
    },
    asking: {
      on: {
        'request.granted': { target: 'on' },

        // A browser that cannot read the permission gives no way to tell a block from a closed
        // prompt, so its refusal counts as a block.
        'request.refused': [
          { guard: (refused) => refused.event.state === 'granted', target: 'on' },
          { guard: (refused) => refused.event.state === 'prompt', target: 'not-asked' },
          { target: 'blocked' },
        ],
        'request.failed': { target: 'failed' },
      },
    },
    on: {},
    blocked: {
      on: { request: { target: 'asking' } },
    },
    failed: {
      on: { request: { target: 'asking' } },
    },
    unavailable: {},
  },
});
