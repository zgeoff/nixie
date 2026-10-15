import type { Sandbox, SandboxRecorder } from '../types';

interface StubRecordedAdapter {
  readonly id: string;
  readonly list: (owner: string) => Promise<readonly Pick<Sandbox, 'id' | 'destroy'>[]>;

  // the ID of each sandbox destroyed, in order
  readonly destroyed: readonly string[];
}

// The part of an adapter that recovery reaches: list returns each sandbox the recorder holds for
// this adapter and the owner, as a real adapter rebuilds them from its records, and destroy notes
// the sandbox's ID.
export function buildStubRecordedAdapter(
  recorder: SandboxRecorder,
  id: string,
): StubRecordedAdapter {
  const destroyed: string[] = [];

  return {
    id,
    list: async (owner) => {
      const rows = await recorder.list(id, owner);

      return rows.map((row) => ({
        id: row.sandboxID,
        destroy: () => {
          destroyed.push(row.sandboxID);

          return Promise.resolve();
        },
      }));
    },
    destroyed,
  };
}
