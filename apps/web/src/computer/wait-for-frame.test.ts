import { expect, jest, onTestFinished, test } from 'bun:test';
import { waitForFrame } from './wait-for-frame';

// a canvas whose pixels all have the alpha the test gives, where happy-dom draws nothing
function setupTest() {
  jest.useFakeTimers();

  onTestFinished(() => {
    jest.useRealTimers();
  });

  const target = document.createElement('div');
  const canvas = document.createElement('canvas');
  const drawing = { alpha: 0 };

  canvas.width = 320;
  canvas.height = 200;

  Object.defineProperty(canvas, 'getContext', {
    value: () => ({ getImageData: () => ({ data: [0, 0, 0, drawing.alpha] }) }),
  });

  target.append(canvas);

  const frames = { count: 0 };

  const stop = waitForFrame(target, () => {
    frames.count += 1;
  });

  onTestFinished(stop);

  return { drawing, frames, stop };
}

test('it reports no frame while the canvas is still transparent', () => {
  const ctx = setupTest();

  jest.advanceTimersByTime(200);

  expect(ctx.frames.count).toBe(0);
});

test('it reports a frame once, when the canvas draws a picture', () => {
  const ctx = setupTest();

  ctx.drawing.alpha = 255;

  jest.advanceTimersByTime(200);

  expect(ctx.frames.count).toBe(1);
});

test('it reports no frame after it is stopped', () => {
  const ctx = setupTest();

  ctx.stop();

  ctx.drawing.alpha = 255;

  jest.advanceTimersByTime(200);

  expect(ctx.frames.count).toBe(0);
});
