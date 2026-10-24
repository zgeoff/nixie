import { expect, test } from 'bun:test';
import { labelSchema, sampleKeySchema } from './score-turns.ts';

test('#labelSchema accepts a label with its needed references and best one', () => {
  expect(labelSchema.safeParse({ caseID: 't4', relevant: ['M1', 'M3'], best: 'M3' }).data).toStrictEqual({
    caseID: 't4',
    relevant: ['M1', 'M3'],
    best: 'M3',
  });
});

test('#labelSchema rejects a label whose needed references are one string', () => {
  expect(labelSchema.safeParse({ caseID: 't4', relevant: 'M1', best: 'M1' }).error?.issues).toContainEqual(
    expect.objectContaining({ path: ['relevant'] }),
  );
});

test('#sampleKeySchema accepts a key that maps each reference to an item', () => {
  expect(sampleKeySchema.safeParse({ caseID: 't4', refs: { M1: 'item-a' } }).data).toStrictEqual({
    caseID: 't4',
    refs: { M1: 'item-a' },
  });
});

test('#sampleKeySchema rejects a key whose reference maps to a number', () => {
  expect(sampleKeySchema.safeParse({ caseID: 't4', refs: { M1: 7 } }).error?.issues).toContainEqual(
    expect.objectContaining({ path: ['refs', 'M1'] }),
  );
});
