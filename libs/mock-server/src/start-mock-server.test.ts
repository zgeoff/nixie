import { expect, onTestFinished, spyOn, test } from 'bun:test';

test('it lets a fetch of a data URL through to its contents without an error', async () => {
  const consoleError = spyOn(console, 'error');

  onTestFinished(() => {
    consoleError.mockRestore();
  });

  const response = await fetch('data:text/plain;base64,aGFyYm91cg==');
  const text = await response.text();

  expect(text).toBe('harbour');
  expect(consoleError).not.toHaveBeenCalled();
});
