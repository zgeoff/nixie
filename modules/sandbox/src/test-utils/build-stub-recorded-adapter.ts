import type { Sandbox, SandboxRecorder } from '../types';

interface StubRecordedAdapter {
  readonly id: string;
  readonly list: (owner: string) => Promise<readonly Pick<Sandbox, 'id' | 'spec' | 'destroy'>[]>;

  readonly destroyed: readonly string[];
}

export interface StubRecordedAdapterOptions {
  // the IDs of the sandboxes whose destroy rejects
  readonly failingIDs?: readonly string[];
}

export function buildStubRecordedAdapter(
  recorder: SandboxRecorder,
  id: string,
  options: StubRecordedAdapterOptions = {},
): StubRecordedAdapter {
  const destroyed: string[] = [];

  return {
    id,
    list: async (owner) => {
      const rows = await recorder.list(id, owner);

      return rows.map((row) => ({
        id: row.sandboxID,
        spec: row.spec,
        destroy: () => {
          if (options.failingIDs?.includes(row.sandboxID) === true) {
            return Promise.reject(new Error(`the host cannot destroy ${row.sandboxID}`));
          }

          destroyed.push(row.sandboxID);

          return Promise.resolve();
        },
      }));
    },
    destroyed,
  };
}
