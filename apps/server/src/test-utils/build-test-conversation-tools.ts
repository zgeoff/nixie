import { buildTimeTool, buildWebFetchTool } from '@heynixie/connectors';
import type { MemoryToolStore } from '@heynixie/memory';
import { buildLogReadTool } from '@heynixie/memory';
import { makeDecisionPoint } from '@heynixie/policy';
import type { FetchReply } from '@heynixie/wire';
import { buildConversationTools } from '../build-conversation-tools';
import type { BuildTestServerTools } from './start-test-server';

export interface TestConversationTools {
  // the endpoint's tools, built from the test server's context
  readonly buildTools: BuildTestServerTools;

  // gives the memory tools the store once it starts, as the server's registry does
  readonly setStore: (store: MemoryToolStore) => void;
}

// Builds the conversation's own tools behind the fixed rules: web fetch, whose every fetch returns
// the reply given, the time tool and log reader on the server's context, and the memory tools over
// the store set later, which throw until it is set.
export function buildTestConversationTools(reply: FetchReply): TestConversationTools {
  const stores: { current: MemoryToolStore | null } = { current: null };

  return {
    buildTools: (context) => {
      const definitions = buildConversationTools(
        {
          webFetch: buildWebFetchTool(() => Promise.resolve(reply)),
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
