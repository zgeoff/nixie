import { expect, test } from 'bun:test';
import { fillStatusText } from './fill-status-text';

test('it fills each slot and leaves braces in a value as they are', () => {
  const text = fillStatusText('{{ label }} is {{ status }}', {
    label: '{{ status }}',
    status: 'failing',
  });

  expect(text).toBe('{{ status }} is failing');
});

test('it leaves a slot with no value as it is', () => {
  expect(fillStatusText('a {{ missing }} slot', {})).toBe('a {{ missing }} slot');
});
