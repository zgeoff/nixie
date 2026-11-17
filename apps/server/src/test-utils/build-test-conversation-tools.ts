import {
  buildTimeTool,
  buildWebFetchTool,
  makeFetchBackoff,
  webFetchDefaults,
} from '@heynixie/connectors';
import type { MemoryToolStore } from '@heynixie/memory';
import { buildLogReadImageTool, buildLogReadTool } from '@heynixie/memory';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { readTaskNames } from '@heynixie/tasks';
import type { FetchReply } from '@heynixie/wire';
import { buildConversationTools } from '../conversation/build-conversation-tools';
import type { BuildTestServerTools } from './start-test-server';

export interface TestConversationTools {
  readonly buildTools: BuildTestServerTools;

  readonly setStore: (store: MemoryToolStore) => void;
}

export function buildTestConversationTools(reply: FetchReply): TestConversationTools {
  const stores: { current: MemoryToolStore | null } = { current: null };

  return {
    buildTools: (context) => {
      const definitions = buildConversationTools(
        {
          webFetch: buildWebFetchTool(() => Promise.resolve(reply), {
            log: context.log,
            textBytes: webFetchDefaults.limits.textBytes,
            linkPathChars: webFetchDefaults.linkPathChars,
            pageStoreBytes: webFetchDefaults.pageStoreBytes,
            imageLongEdge: webFetchDefaults.imageLongEdge,
            cacheMs: 0,
            backoff: makeFetchBackoff({
              backoffMs: webFetchDefaults.backoff.backoffMs,
              backoffCapMs: webFetchDefaults.backoff.backoffCapMs,
              clock: context.clock,
            }),
            backoffWaitMs: webFetchDefaults.backoff.backoffWaitMs,
            findSecret: () => null,
            isOwnerTyped: () => Promise.resolve(false),
            logger: () => {},
            secretTypedURLCovers: 'redirects',
            clock: context.clock,
          }),
          time: buildTimeTool({
            clock: context.clock,
            findTimeZone: () => Promise.resolve(null),
            defaultZone: 'UTC',
          }),
          logReaders: [
            buildLogReadTool(context.log, () => readTaskNames(context)),
            buildLogReadImageTool(context.log),
          ],
          skills: [],
          prompts: [],
          tasks: [],
        },
        {
          readStore: () => stores.current,
          clock: context.clock,
          ownerName: null,
          defaultZone: 'UTC',
        },
      );

      return {
        definitions,
        decide: readStarterDecisionPoint(
          (name) => definitions.find((definition) => definition.name === name)?.declaration ?? null,
        ),
      };
    },
    setStore: (store) => {
      stores.current = store;
    },
  };
}
