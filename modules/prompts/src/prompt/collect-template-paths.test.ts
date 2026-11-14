import { expect, test } from 'bun:test';
import { collectTemplatePaths } from './collect-template-paths';

test('it collects each path in order, trimmed, with repeats', () => {
  expect(collectTemplatePaths('{{ persona }}, {{owner.name}} and {{ persona }}')).toStrictEqual([
    'persona',
    'owner.name',
    'persona',
  ]);
});

test('it collects no path from text with backticks, guillemets and brackets alone', () => {
  expect(collectTemplatePaths('`code` «evidence» ⟦pasted⟧ {single}')).toStrictEqual([]);
});
