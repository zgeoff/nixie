import type { RecordForgets } from '@heynixie/api';
import {
  buildImageErasable,
  buildRecordErasable,
  conversationErasableDescriptor,
  imageErasableDescriptor,
  recordErasableDescriptor,
} from '@heynixie/api';
import { writeBackupFloor } from '@heynixie/backup';
import { makeCodeRunCleanup } from '@heynixie/connectors';
import type { ErasureHandle, ErasureRunnerControl } from '@heynixie/log';
import { localDataStorage, makeErasureRunner } from '@heynixie/log';
import { buildExpiryErasable, expiryErasableDescriptor } from '@heynixie/memory';
import type { ExpiryRequest } from '@heynixie/memory';
import { buildTextErasable, phoneTextErasableDescriptor } from '@heynixie/phone';
import { readCleanedTaskIDs } from '@heynixie/sessions';
import { waitAtFaultPoint } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { ServerPartValues } from '../part/server-part-values';
import { makeStopWork } from '../server/make-stop-work';
import type { PartReader, ServerParts } from '../types';
import type {
  ConversationErasableOptions,
  ConversationErasureRequest,
} from './build-conversation-erasable';
import { buildConversationErasable } from './build-conversation-erasable';
import { collectCleanedCauses } from './collect-cleaned-causes';

// What the runner takes of the server's parts and of the started parts, so a test supplies each
// one for real.
export type ErasureRunnerParts = Pick<ServerParts, 'context' | 'apiContext' | 'turnInputs'> & {
  readonly tools: {
    readonly adapter: ConversationErasableOptions['adapter'];
    readonly webFetch: { readonly clearPauses: () => void };
  };
  readonly cleanup: Pick<ServerParts['cleanup'], 'stop'>;
  readonly config: { readonly backup: Pick<ServerParts['config']['backup'], 'isEnabled'> };
};

export interface ErasureRunnerValues {
  readonly conversation_imp: Pick<ServerPartValues['conversation_imp'], 'cleanupSessions'>;
  readonly sandbox_runner: Pick<ServerPartValues['sandbox_runner'], 'cleanupSessions'>;
  readonly memory: Pick<ServerPartValues['memory'], 'finishEvidencePurges'>;
  readonly phone: Pick<ServerPartValues['phone'], 'bindForget'>;
  readonly api_gate: Pick<ServerPartValues['api_gate'], 'close'>;
}

// The runner with the handles of the kinds that the API and the reset begin.
export interface StartedErasureRunner extends ErasureRunnerControl {
  readonly forgets: RecordForgets;
  readonly forgetConversation: ErasureHandle<ConversationErasureRequest>;
  readonly expire: ErasureHandle<ExpiryRequest>;
}

// The runner takes every forget through the same steps. Only the server reaches the sessions, the
// turn inputs and the sandboxes at once, so it supplies each as an effect, and the notebook and the
// memory store register their erasables with the runner it returns.
export function startErasureRunner(
  parts: ErasureRunnerParts,
  reader: PartReader<ErasureRunnerValues>,
): StartedErasureRunner {
  const conversation = reader.get('conversation_imp');
  const tasks = reader.get('sandbox_runner');

  const runner = makeErasureRunner({
    log: parts.context.log,
    definitions: parts.context.definitions,
    effects: {
      closeCaptures: () => parts.turnInputs.closeCaptures({ cause: 'forget' }),
      holdCaptures: (erasureID) => {
        parts.turnInputs.holdCaptures(erasureID);
      },
      releaseCaptures: (erasureID) => {
        parts.turnInputs.releaseCaptures(erasureID);
      },
      destroySandboxes: async (callIDs) => {
        // Built from the adapter, so an erasure destroys the code sandboxes that remain while the code
        // tool is off.
        await makeCodeRunCleanup(parts.context.log, parts.tools.adapter).destroyForRecords(
          callIDs.map(Number),
        );
      },
      cleanupSessions: async (cause) => {
        await conversation.cleanupSessions(cause);
        await tasks.cleanupSessions(cause);
      },
      readCleanedThreads: async (cause) => {
        const threads = await Promise.all(
          collectCleanedCauses(cause).map((each) => readCleanedTaskIDs(parts.context, each)),
        );

        return [...new Set(threads.flat())];
      },
      finishPurges: async (recordSequence) => {
        const memory = reader.find('memory');

        invariant(memory, 'the memory store is started when an erasure holds a purge');

        await memory.finishEvidencePurges({ recordSequence });
      },
      removeTurnInputs: (scope) => parts.turnInputs.removeForgotten(scope),
      writeBackupFloor: (tx) =>
        parts.config.backup.isEnabled
          ? writeBackupFloor({ storage: localDataStorage, writer: parts.context.log.writer }, tx)
          : Promise.resolve(),
      reachFaultPoint: (point, erasureID) =>
        NIXIE_TEST_BUILD
          ? waitAtFaultPoint(point, { kind: 'erasure', id: erasureID })
          : Promise.resolve(),
    },
  });

  // Registered whether or not the phone is on, because a forget of a text that a crash cut short
  // finishes at the next start, and the entry reads only the log. The phone's own forget uses the
  // handle.
  const forgetText = runner.register({ ...phoneTextErasableDescriptor, ...buildTextErasable() });

  reader.find('phone')?.bindForget(forgetText);

  // Registered whether or not the images feature is on, because a forget that a crash cut short
  // finishes at the next start, and each entry reads only the log.
  const forgets = {
    record: runner.register({
      ...recordErasableDescriptor,
      ...buildRecordErasable(parts.apiContext),
    }),
    image: runner.register({ ...imageErasableDescriptor, ...buildImageErasable(parts.apiContext) }),
  };

  const stopWork = makeStopWork({ closeAPI: reader.get('api_gate').close, work: parts.cleanup });

  const forgetConversation = runner.register({
    ...conversationErasableDescriptor,
    ...buildConversationErasable({
      context: parts.apiContext,
      adapter: parts.tools.adapter,
      stopWork,
      clearFetchPauses: parts.tools.webFetch.clearPauses,
    }),
  });

  // Registered whether or not anything expires, because an expiry that a crash cut short finishes at
  // the next start, and the entry reads only the log.
  const expire = runner.register({
    ...expiryErasableDescriptor,
    ...buildExpiryErasable({ log: parts.context.log }),
  });

  return { ...runner, forgets, forgetConversation, expire };
}
