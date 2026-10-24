import { expect, test } from 'bun:test';
import { toPeakLevel } from './to-peak-level.ts';

test('it scales the samples so the loudest one reaches the peak', () => {
  expect(toPeakLevel(new Float32Array([0.05, -0.1, 0.025]), 0.5)).toStrictEqual(new Float32Array([0.25, -0.5, 0.125]));
});

test('it leaves silence as silence', () => {
  expect(toPeakLevel(new Float32Array([0, 0]), 0.5)).toStrictEqual(new Float32Array([0, 0]));
});
