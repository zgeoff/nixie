import { expect, test } from 'bun:test';
import { buildStubFailingLogger } from './build-stub-failing-logger';

test('it throws on the first call', () => {
  const stub = buildStubFailingLogger();

  expect(() => {
    stub.log('definitions.seeded');
  }).toThrowWithMessage(Error, 'the logger refused definitions.seeded');
});

test('it records every event after the first call', async () => {
  const stub = buildStubFailingLogger();

  const first = await Promise.try(() => {
    stub.log('definitions.seeded');
  }).then(
    () => null,
    (error: unknown) => error,
  );

  stub.log('definitions.seeded');
  stub.log('definitions.probed');

  expect(first).toBeInstanceOf(Error);
  expect(stub.events).toStrictEqual(['definitions.seeded', 'definitions.probed']);
});
