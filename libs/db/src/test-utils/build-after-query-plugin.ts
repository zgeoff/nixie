import type { KyselyPlugin } from 'kysely';

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
