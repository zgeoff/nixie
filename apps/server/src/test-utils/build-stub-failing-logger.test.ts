import { expect, test } from 'bun:test';
import { buildStubFailingLogger } from './build-stub-failing-logger';

test('it throws on the first call', () => {
  const stub = buildStubFailingLogger();

  expect(() => {
    stub.log('definitions.seeded');
  }).toThrowWithMessage(Error, 'the logger refused definitions.seeded');
});

test('it records every event after the first call', () => {
  const stub = buildStubFailingLogger();

  expect(() => {
    stub.log('definitions.seeded');
  }).toThrow(Error);

  stub.log('definitions.seeded');
  stub.log('definitions.probed');

  expect(stub.events).toStrictEqual(['definitions.seeded', 'definitions.probed']);
});
