import type { APIContext } from '@heynixie/api';
import { conversationErasableDescriptor } from '@heynixie/api';
import { makeCodeRunCleanup } from '@heynixie/connectors';
import type { ErasureEffects, ErasureHandle, ErasureRunnerControl } from '@heynixie/log';
import { makeErasureRunner } from '@heynixie/log';
import type { TestErasureEffects } from '@heynixie/log/test-utils';
import { buildTestErasureEffects } from '@heynixie/log/test-utils';
import type { Logger } from '@heynixie/logger';
import type {
  ConversationErasableOptions,
  ConversationErasureRequest,
} from '../erasure/build-conversation-erasable';
import { buildConversationErasable } from '../erasure/build-conversation-erasable';
import type { ConversationReset } from '../erasure/run-conversation-reset';
import { runConversationReset } from '../erasure/run-conversation-reset';

interface TestConversationResetOptions {
  readonly adapter: ConversationErasableOptions['adapter'];
  readonly log: Logger;
  readonly stopWork?: () => Promise<void>;
  readonly clearFetchPauses?: () => void;
  readonly removeTurnInputs?: ErasureEffects['removeTurnInputs'];
}

export interface TestConversationReset {
  readonly runner: ErasureRunnerControl;

  // the calls of the runner's effects, and the fault points that a test arms
  readonly effects: TestErasureEffects;
  readonly forgetConversation: ErasureHandle<ConversationErasureRequest>;
  readonly run: () => Promise<ConversationReset>;
}

// The conversation's erasable on a runner whose effects touch nothing but the code sandboxes and,
// when a test gives one, the turn-input removal. The runner reads and deletes through the log for
// real.
export function startTestConversationReset(
  context: APIContext,
  options: TestConversationResetOptions,
): TestConversationReset {
  const effects = buildTestErasureEffects();

  const runner = makeErasureRunner({
    log: context.log,
    definitions: context.definitions,
    effects: {
      ...effects.effects,
      destroySandboxes: (callIDs) =>
        makeCodeRunCleanup(context.log, options.adapter).destroyForRecords(callIDs.map(Number)),
      ...(options.removeTurnInputs === undefined
        ? {}
        : { removeTurnInputs: options.removeTurnInputs }),
    },
  });

  const forgetConversation = runner.register({
    ...conversationErasableDescriptor,
    ...buildConversationErasable({
      context,
      adapter: options.adapter,
      stopWork: options.stopWork ?? (() => Promise.resolve()),
      clearFetchPauses: options.clearFetchPauses ?? (() => {}),
    }),
  });

  return {
    runner,
    effects,
    forgetConversation,
    run: () => runConversationReset({ context, log: options.log, forgetConversation }),
  };
}
