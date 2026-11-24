import { expect, test } from 'bun:test';
import { imageNames } from './image-names.ts';
import { imageSizeBudgets } from './image-size-budgets.ts';
import { pickImageSizeVerdict } from './pick-image-size-verdict.ts';

test('it names an image that is over its budget', () => {
  const budgetMiB = imageSizeBudgets.fetch;

  expect(pickImageSizeVerdict('fetch', (budgetMiB + 1) * 1024 * 1024)).toBe(
    `fetch is ${budgetMiB + 1} MiB, over its ${budgetMiB} MiB budget`,
  );
});

test('it rounds the size of an image over its budget up to a whole MiB', () => {
  const budgetMiB = imageSizeBudgets.code;

  expect(pickImageSizeVerdict('code', budgetMiB * 1024 * 1024 + 1)).toBe(
    `code is ${budgetMiB + 1} MiB, over its ${budgetMiB} MiB budget`,
  );
});

test('it passes an image exactly at its budget', () => {
  expect(pickImageSizeVerdict('nixie', imageSizeBudgets.nixie * 1024 * 1024)).toBeNull();
});

test('it passes an image under its budget', () => {
  expect(pickImageSizeVerdict('nixie', 1)).toBeNull();
});

test('it gives every image a positive whole-MiB budget', () => {
  expect(imageNames.map((name) => imageSizeBudgets[name])).toSatisfyAll(
    (budgetMiB) => Number.isInteger(budgetMiB) && budgetMiB > 0,
  );
});
