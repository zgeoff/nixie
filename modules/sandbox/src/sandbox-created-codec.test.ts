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
