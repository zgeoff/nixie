import type { runtime } from '@pulumi/pulumi';

export interface StubResourceMocks {
  readonly mocks: runtime.Mocks;
  readonly whenRegistered: (key: string) => Promise<Record<string, unknown>>;
}

export function buildStubResourceMocks(): StubResourceMocks {
  const registered = new Map<string, PromiseWithResolvers<Record<string, unknown>>>();

  const getRegistered = (key: string): PromiseWithResolvers<Record<string, unknown>> => {
    const existing = registered.get(key) ?? Promise.withResolvers<Record<string, unknown>>();

    registered.set(key, existing);

    return existing;
  };

  return {
    whenRegistered: (key) => getRegistered(key).promise,
    mocks: {
      newResource: (args: runtime.MockResourceArgs) => {
        const inputs = toRecord(args.inputs);

        getRegistered(`${args.type}::${args.name}`).resolve(inputs);

        // the engine's autonaming names a resource that sets no metadata.name, and the mock
        // monitor skips the engine
        return {
          id: `${args.name}-id`,
          state: {
            ...inputs,
            metadata: { name: `${args.name}-0a1b2c3d`, ...toRecord(inputs['metadata']) },
          },
        };
      },
      call: (args: runtime.MockCallArgs) => toRecord(args.inputs),
    },
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? { ...value } : {};
}
