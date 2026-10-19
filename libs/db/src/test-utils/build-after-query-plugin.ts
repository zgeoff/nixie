import type { KyselyPlugin } from 'kysely';

// Builds a Kysely plugin that runs the action once, after the result of the handle's nth query and
// before the caller sees it, so a test can commit another connection's write between 2 reads.
export function buildAfterQueryPlugin(
  queryNumber: number,
  action: () => Promise<void>,
): KyselyPlugin {
  const state = { seen: 0 };

  return {
    transformQuery: (args) => args.node,
    transformResult: async (args) => {
      state.seen += 1;

      if (state.seen === queryNumber) {
        await action();
      }

      return args.result;
    },
  };
}
