import { expect, test } from 'bun:test';
import { sandboxCreatedCodec } from './sandbox-created-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = sandboxCreatedCodec.encode({
    sandboxID: 'sandbox-1',
    adapter: 'process',
    spec: {
      kind: 'fetch',
      image: 'nixie-fetch',
      owner: 'step-1',
      egress: { kind: 'allow', hosts: ['example.test'] },
      grants: [{ secret: 'model-key', host: 'api.example.test', env: { API_KEY: 'placeholder' } }],
      toolRoute: false,
      limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    },
  });

  expect(sandboxCreatedCodec.decode(payload)).toStrictEqual({
    sandboxID: 'sandbox-1',
    adapter: 'process',
    spec: {
      kind: 'fetch',
      image: 'nixie-fetch',
      owner: 'step-1',
      egress: { kind: 'allow', hosts: ['example.test'] },
      grants: [{ secret: 'model-key', host: 'api.example.test', env: { API_KEY: 'placeholder' } }],
      toolRoute: false,
      limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    },
  });
});

test('it refuses a spec with an egress of another kind', () => {
  expect(() =>
    sandboxCreatedCodec.decode({
      sandboxID: 'sandbox-1',
      adapter: 'process',
      spec: {
        kind: 'fetch',
        image: 'nixie-fetch',
        owner: 'step-1',
        egress: { kind: 'private' },
        grants: [],
        toolRoute: false,
        limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
      },
    }),
  ).toThrow(/"egress"/u);
});

test.each(['browser', 'shell'] as const)(
  'it still decodes the spec of a %s sandbox that an earlier release recorded',
  (kind) => {
    const payload = sandboxCreatedCodec.encode({
      sandboxID: 'sandbox-1',
      adapter: 'imp',
      spec: {
        kind,
        image: `nixie-${kind}`,
        owner: `computer-${kind}`,
        egress: { kind: 'public' },
        grants: [],
        toolRoute: false,
        limits: { vcpus: 1, memoryMiB: 512, diskMiB: 8192 },
      },
    });

    expect(sandboxCreatedCodec.decode(payload)).toMatchObject({ spec: { kind } });
  },
);
