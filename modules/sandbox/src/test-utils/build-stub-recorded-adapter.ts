import type { Sandbox, SandboxRecorder } from '../types';

interface StubRecordedAdapter {
  readonly id: string;
  readonly list: (owner: string) => Promise<readonly Pick<Sandbox, 'id' | 'destroy'>[]>;

  readonly destroyed: readonly string[];
}

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
