import { expect, test } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';
import invariant from 'tiny-invariant';
import { registerStubResizeObserver } from '../test-utils/register-stub-resize-observer';
import { ConversationScroller } from './conversation-scroller';

test('it keeps the view at its end when the view shrinks', () => {
  const resizes = registerStubResizeObserver();

  const rendered = render(
    <ConversationScroller arrivals={1} sends={0}>
      <ol aria-label="Conversation" />
    </ConversationScroller>,
  );

  const scroller = rendered.getByRole('list', { name: 'Conversation' }).parentElement;

  invariant(scroller);

  // happy-dom lays nothing out, so fixed sizes stand in for the browser's layout.
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 });
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });

  scroller.scrollTop = 600;

  // userEvent cannot scroll, so the scroll event comes from fireEvent.
  fireEvent.scroll(scroller);
  resizes.resize(scroller);

  expect(scroller.scrollTop).toBe(1000);
});

test('it holds the view in place when the view shrinks after you scrolled up to read', () => {
  const resizes = registerStubResizeObserver();

  const rendered = render(
    <ConversationScroller arrivals={1} sends={0}>
      <ol aria-label="Conversation" />
    </ConversationScroller>,
  );

  const scroller = rendered.getByRole('list', { name: 'Conversation' }).parentElement;

  invariant(scroller);

  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 });
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });

  scroller.scrollTop = 100;

  fireEvent.scroll(scroller);
  resizes.resize(scroller);

  expect(scroller.scrollTop).toBe(100);
});

test('it follows a new arrival to the end when the view is at the end', () => {
  const rendered = render(
    <ConversationScroller arrivals={1} sends={0}>
      <ol aria-label="Conversation" />
    </ConversationScroller>,
  );

  const scroller = rendered.getByRole('list', { name: 'Conversation' }).parentElement;

  invariant(scroller);

  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 });
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });

  scroller.scrollTop = 600;

  fireEvent.scroll(scroller);
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1200 });

  rendered.rerender(
    <ConversationScroller arrivals={2} sends={0}>
      <ol aria-label="Conversation" />
    </ConversationScroller>,
  );

  expect(scroller.scrollTop).toBe(1200);
});

test('it follows a new arrival when the view is near but not at the end', () => {
  const rendered = render(
    <ConversationScroller arrivals={1} sends={0}>
      <ol aria-label="Conversation" />
    </ConversationScroller>,
  );

  const scroller = rendered.getByRole('list', { name: 'Conversation' }).parentElement;

  invariant(scroller);

  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 });
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });

  scroller.scrollTop = 560;

  fireEvent.scroll(scroller);
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1200 });

  rendered.rerender(
    <ConversationScroller arrivals={2} sends={0}>
      <ol aria-label="Conversation" />
    </ConversationScroller>,
  );

  expect(scroller.scrollTop).toBe(1200);
});

test('it holds the view in place for a new arrival when you scrolled up to read', () => {
  const rendered = render(
    <ConversationScroller arrivals={1} sends={0}>
      <ol aria-label="Conversation" />
    </ConversationScroller>,
  );

  const scroller = rendered.getByRole('list', { name: 'Conversation' }).parentElement;

  invariant(scroller);

  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 });
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });

  scroller.scrollTop = 100;

  fireEvent.scroll(scroller);
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1200 });

  rendered.rerender(
    <ConversationScroller arrivals={2} sends={0}>
      <ol aria-label="Conversation" />
    </ConversationScroller>,
  );

  expect(scroller.scrollTop).toBe(100);
});

test('it brings the view to the end when you send a message after scrolling up', () => {
  const rendered = render(
    <ConversationScroller arrivals={1} sends={0}>
      <ol aria-label="Conversation" />
    </ConversationScroller>,
  );

  const scroller = rendered.getByRole('list', { name: 'Conversation' }).parentElement;

  invariant(scroller);

  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 });
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });

  scroller.scrollTop = 100;

  fireEvent.scroll(scroller);
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1200 });

  rendered.rerender(
    <ConversationScroller arrivals={2} sends={1}>
      <ol aria-label="Conversation" />
    </ConversationScroller>,
  );

  expect(scroller.scrollTop).toBe(1200);
});
