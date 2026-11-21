import { expect, test } from 'bun:test';
import { formatImageSize, isImageSize, parseImageSize, pickNearestImageSize } from './image-size';

test.each([
  { width: 1920, height: 480, size: '1536x1024' },
  { width: 1000, height: 1000, size: '1024x1024' },
  { width: 1000, height: 1100, size: '1024x1024' },
  { width: 480, height: 1920, size: '1024x1536' },
  { width: 1536, height: 1024, size: '1536x1024' },
])('#pickNearestImageSize picks $size for $width by $height', (row) => {
  expect(pickNearestImageSize(row)).toBe(row.size);
});

test('#parseImageSize reads the two sides of a size', () => {
  expect(parseImageSize('1920x480')).toStrictEqual({ width: 1920, height: 480 });
});

test('#parseImageSize returns null for text that is no size', () => {
  expect(parseImageSize('wide')).toBeNull();
});

test('#formatImageSize writes the sides as a size', () => {
  expect(formatImageSize({ width: 7, height: 9 })).toBe('7x9');
});

test.each([
  { size: '1024x1024', isSize: true },
  { size: '1920x480', isSize: false },
])('#isImageSize answers $isSize for $size', (row) => {
  expect(isImageSize(row.size)).toBe(row.isSize);
});
