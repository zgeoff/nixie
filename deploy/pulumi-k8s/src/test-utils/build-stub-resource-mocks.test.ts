import { expect, test } from 'bun:test';
import { buildStubResourceMocks } from './build-stub-resource-mocks';

test('it resolves the wait for a resource with the inputs it registered', async () => {
  const stub = buildStubResourceMocks();
  const registered = stub.whenRegistered('kubernetes:core/v1:ConfigMap::app-config');

  await stub.mocks.newResource({
    type: 'kubernetes:core/v1:ConfigMap',
    name: 'app-config',
    inputs: { metadata: { namespace: 'apps' }, data: { 'app.yaml': 'port: 80\n' } },
  });

  const inputs = await registered;

  expect(inputs).toStrictEqual({
    metadata: { namespace: 'apps' },
    data: { 'app.yaml': 'port: 80\n' },
  });
});

test('it answers a resource with no metadata name with an autonamed one', async () => {
  const stub = buildStubResourceMocks();

  const result = await stub.mocks.newResource({
    type: 'kubernetes:core/v1:ConfigMap',
    name: 'app-config',
    inputs: { metadata: { namespace: 'apps' } },
  });

  expect(result).toStrictEqual({
    id: 'app-config-id',
    state: { metadata: { name: 'app-config-0a1b2c3d', namespace: 'apps' } },
  });
});

test('it answers a resource with the metadata name it set', async () => {
  const stub = buildStubResourceMocks();

  const result = await stub.mocks.newResource({
    type: 'kubernetes:core/v1:Service',
    name: 'app',
    inputs: { metadata: { name: 'app-api', namespace: 'apps' } },
  });

  expect(result).toStrictEqual({
    id: 'app-id',
    state: { metadata: { name: 'app-api', namespace: 'apps' } },
  });
});
