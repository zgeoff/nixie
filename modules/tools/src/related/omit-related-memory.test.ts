import { expect, test } from 'bun:test';
import { omitRelatedMemory } from './omit-related-memory';

test('it leaves out related and keeps every other field', () => {
  const result = omitRelatedMemory({
    reminder: 'k3m9q2xzab',
    related: [{ shortID: 'p8w2n4vmcd', text: 'The beds are raised' }],
  });

  expect(result).toStrictEqual({ reminder: 'k3m9q2xzab' });
});

test('it returns a result without related as it was', () => {
  expect(omitRelatedMemory({ reminder: 'k3m9q2xzab' })).toStrictEqual({ reminder: 'k3m9q2xzab' });
});
