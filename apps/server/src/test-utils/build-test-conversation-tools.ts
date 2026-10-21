import { buildTimeTool, buildWebFetchTool, webFetchDefaults } from '@heynixie/connectors';
import type { MemoryToolStore } from '@heynixie/memory';
import { buildLogReadTool } from '@heynixie/memory';
import { makeDecisionPoint } from '@heynixie/policy';
import type { FetchReply } from '@heynixie/wire';
import { buildConversationTools } from '../build-conversation-tools';
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
          }),
          time: buildTimeTool({
            clock: context.clock,
            findTimeZone: () => Promise.resolve(null),
            defaultZone: 'UTC',
          }),
          logRead: buildLogReadTool(context.log),
          skills: [],
        },
        {
          readStore: () => stores.current,
          clock: context.clock,
          ownerName: null,
          agentName: null,
          defaultZone: 'UTC',
        },
      );

      return {
        definitions,
        decide: makeDecisionPoint({
          findDeclaration: (name) =>
            definitions.find((definition) => definition.name === name)?.declaration ?? null,
        }),
      };
    },
    setStore: (store) => {
      stores.current = store;
    },
  };
}
