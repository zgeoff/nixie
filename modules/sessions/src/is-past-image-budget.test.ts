import { expect, test } from 'bun:test';
import { isPastImageBudget } from './is-past-image-budget';

test('it reads images that pass the byte budget as past it', () => {
  expect(
    isPastImageBudget({ bytes: 90, count: 1 }, { bytes: 20, count: 1 }, { bytes: 100, count: 10 }),
  ).toBeTrue();
});

test('it reads images that pass the count budget as past it, however few their bytes', () => {
  expect(
    isPastImageBudget({ bytes: 10, count: 9 }, { bytes: 2, count: 2 }, { bytes: 100, count: 10 }),
  ).toBeTrue();
});

test('it reads images that bring the spent images to the budget as within it', () => {
  expect(
    isPastImageBudget({ bytes: 80, count: 8 }, { bytes: 20, count: 2 }, { bytes: 100, count: 10 }),
  ).toBeFalse();
});

test('it reads a message with no images as within a budget already spent', () => {
  expect(
    isPastImageBudget({ bytes: 120, count: 12 }, { bytes: 0, count: 0 }, { bytes: 100, count: 10 }),
  ).toBeFalse();
});
