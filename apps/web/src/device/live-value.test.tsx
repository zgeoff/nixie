import { expect, jest, onTestFinished, test } from 'bun:test';
import { act } from '@testing-library/react';
import { render } from '../test-utils/render';
import { LiveValue } from './live-value';

function setupTest() {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-21T08:05:00.000Z'));

  onTestFinished(() => {
    jest.useRealTimers();
  });

  return {
    advance: (durationMs: number) => {
      act(() => {
        jest.advanceTimersByTime(durationMs);
      });
    },
  };
}

test('it keeps a clock fresh with no event after it starts', () => {
  const ctx = setupTest();

  const rendered = render(
    <LiveValue content={{ kind: 'live', live: 'clock', format: 'HH:mm:ss' }} />,
  );

  const first = rendered.container.textContent;

  ctx.advance(5000);

  expect([first?.slice(-2), rendered.container.textContent?.slice(-2)]).toStrictEqual(['00', '05']);
});

test('it counts a countdown down each second with its label', () => {
  const ctx = setupTest();

  const rendered = render(
    <LiveValue
      content={{ kind: 'live', live: 'countdown', to: '2026-11-21T08:10:00.000Z', label: 'Pizza' }}
    />,
  );

  const first = rendered.container.textContent;

  ctx.advance(3000);

  expect([first, rendered.container.textContent]).toStrictEqual(['Pizza5:00', 'Pizza4:57']);
});

test('it shows 0 for a countdown once its time passes', () => {
  const ctx = setupTest();

  const rendered = render(
    <LiveValue content={{ kind: 'live', live: 'countdown', to: '2026-11-21T08:05:02.000Z' }} />,
  );

  ctx.advance(5000);

  expect(rendered.container.textContent).toBe('0');
});
