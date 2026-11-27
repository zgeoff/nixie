import type { Connections } from '@heynixie/connections';

// A snapshot lists the accounts that are you, so a consent that connects an account runs the
// in-force seed before its result goes back.
export function buildSeedingConnections<Held extends Pick<Connections, 'finishConsent'>>(
  connections: Held,
  runSeed: () => Promise<unknown>,
): Held {
  return {
    ...connections,
    finishConsent: async (input) => {
      const result = await connections.finishConsent(input);

      if (result.kind === 'finished') {
        await runSeed();
      }

      return result;
    },
  };
}
