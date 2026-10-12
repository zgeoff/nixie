import { expect, mock, onTestFinished, test } from 'bun:test';
import { registerStubResizeObserver } from './register-stub-resize-observer';

test('it calls back an observer when the test resizes an element it watches', () => {
  const stub = registerStubResizeObserver();
  const callback = mock<ResizeObserverCallback>();
  const target = document.createElement('div');
  const observer = new ResizeObserver(callback);

  observer.observe(target);
  stub.resize(target);

  expect(callback).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ target })], observer);
});

test('it leaves an observer alone when the test resizes an element it does not watch', () => {
  const stub = registerStubResizeObserver();
  const callback = mock<ResizeObserverCallback>();
  const observer = new ResizeObserver(callback);

  observer.observe(document.createElement('div'));
  stub.resize(document.createElement('div'));

  expect(callback).not.toHaveBeenCalled();
});

test('it stops calling back once the observer unobserves the element', () => {
  const stub = registerStubResizeObserver();
  const callback = mock<ResizeObserverCallback>();
  const target = document.createElement('div');
  const observer = new ResizeObserver(callback);

  observer.observe(target);
  observer.unobserve(target);
  stub.resize(target);

  expect(callback).not.toHaveBeenCalled();
});

test('it stops calling back once the observer disconnects', () => {
  const stub = registerStubResizeObserver();
  const callback = mock<ResizeObserverCallback>();
  const target = document.createElement('div');
  const observer = new ResizeObserver(callback);

  observer.observe(target);
  observer.disconnect();
  stub.resize(target);

  expect(callback).not.toHaveBeenCalled();
});

test('it puts the runtime ResizeObserver back after the test', () => {
  const original = globalThis.ResizeObserver;

  registerStubResizeObserver();
  onTestFinished(() => {
    expect(globalThis.ResizeObserver).toBe(original);
  });

  expect(globalThis.ResizeObserver).not.toBe(original);
});
