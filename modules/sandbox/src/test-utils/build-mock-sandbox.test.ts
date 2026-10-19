import { expect, test } from 'bun:test';
import { buildMockSandbox } from './build-mock-sandbox';
import { buildMockSandboxSpec } from './build-mock-sandbox-spec';

test('it builds a default sandbox', () => {
  expect(buildMockSandbox()).toStrictEqual({
    id: expect.toBeString(),
    spec: expect.toContainAllKeys([
      'kind',
      'image',
      'owner',
      'egress',
      'grants',
      'toolRoute',
      'limits',
    ]),
    exec: expect.toBeFunction(),
    spawn: expect.toBeFunction(),
    copyIn: expect.toBeFunction(),
    copyOut: expect.toBeFunction(),
    resolveHome: expect.toBeFunction(),
    collectFiles: expect.toBeFunction(),
    applyMove: expect.toBeFunction(),
    toolRoute: expect.toBeFunction(),
    suspension: { kind: 'none' },
    destroy: expect.toBeFunction(),
    isRetired: false,
  });
});

test('it applies overrides on top of the defaults', () => {
  const spec = buildMockSandboxSpec();

  expect(buildMockSandbox({ id: 'sandbox-1', spec, isRetired: true })).toMatchObject({
    id: 'sandbox-1',
    spec,
    suspension: { kind: 'none' },
    isRetired: true,
  });
});

test('it rejects a call into the sandbox', () => {
  expect(buildMockSandbox().exec({ argv: ['true'] })).rejects.toThrow(
    'the mock sandbox runs nothing',
  );
});
