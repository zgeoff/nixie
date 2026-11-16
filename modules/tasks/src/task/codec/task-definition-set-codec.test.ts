import { expect, test } from 'bun:test';
import { taskDefinitionSetCodec } from './task-definition-set-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskDefinitionSetCodec.encode({
    taskID: 't4k2',
    definitionID: 'water-the-tomatoes',
    definitionHash: null,
  });

  expect(taskDefinitionSetCodec.decode(payload)).toStrictEqual({
    taskID: 't4k2',
    definitionID: 'water-the-tomatoes',
    definitionHash: null,
  });
});

test('it refuses a record with no hash field', () => {
  expect(() =>
    taskDefinitionSetCodec.decode({ taskID: 't4k2', definitionID: 'water-the-tomatoes' }),
  ).toThrow(/"path": \[\s+"definitionHash"\s+\]/u);
});
