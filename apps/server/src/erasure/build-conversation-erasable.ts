import type { APIContext } from '@heynixie/api';
import type { CodeSandboxLister } from '@heynixie/connectors';
import { removeWebFetchThread } from '@heynixie/connectors';
import type { Erasable } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { modelSessionInvalidatedCodec } from '@heynixie/models';
import type { StaleSandboxesOptions } from '@heynixie/sandbox';
import { conversationTaskID } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { startConversationErasure } from './start-conversation-erasure';
import { writeConversationReset } from './write-conversation-reset';

export interface ConversationErasureRequest {
  readonly mode: 'conversations';
}

export interface ConversationErasableOptions {
  readonly context: APIContext;
  readonly adapter: StaleSandboxesOptions['adapter'] & CodeSandboxLister;

  // closes the API and stops every task, so nothing writes to the conversation
  readonly stopWork: () => Promise<void>;

  // empties the web fetch pause of every host, because a host name can show what a conversation read
  readonly clearFetchPauses: () => void;
}

// The conversation's runner methods. A reset captures every key of the conversation's thread and
// its code sandboxes, and has no child. Before the start it stops the work on the thread, destroys
// the guest's sandboxes and ends the session, and it writes log_reset beside erasure.finished.
export function buildConversationErasable(
  options: ConversationErasableOptions,
): Erasable<ConversationErasureRequest> {
  const context = options.context;

  return {
    before: async () => {
      await options.stopWork();

      options.clearFetchPauses();

      // The agent CLI keeps the conversation's transcript on its sandbox's disk, so a kept sandbox
      // would resume it.
      const sandboxes = await options.adapter.list(conversationTaskID);

      await Promise.all(sandboxes.map((sandbox) => sandbox.destroy()));

      const [invalidated] = await writeRecords(context.log, [
        {
          kind: modelSessionInvalidatedCodec.kind,
          definitions: context.definitions(),
          thread: conversationTaskID,
          payload: modelSessionInvalidatedCodec.encode({}),
        },
      ]);

      invariant(invalidated, 'the log wrote no model.session_invalidated record');
    },
    start: (tx) => startConversationErasure(tx, context),
    hide: () => Promise.resolve(),
    readChildren: () => Promise.resolve([]),
    toRequest: () => ({ mode: 'conversations' }),
    writeFinished: (tx, finished) => writeConversationReset(tx, context, finished),
    cleanIndexes: async () => {
      options.clearFetchPauses();

      await removeWebFetchThread(context.log, conversationTaskID);
    },
  };
}
