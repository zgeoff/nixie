import { expect, test } from 'bun:test';
import { ORPCError } from '@orpc/client';
import { act, renderHook } from '@testing-library/react';
import { useActionID } from './use-action-id';

test('it takes a new ID after nixie answered with a result', () => {
  const hook = renderHook(() => useActionID());
  const first = hook.result.current.id;

  act(() => {
    hook.result.current.settle(null);
  });

  expect(hook.result.current.id).not.toBe(first);
});

test('it takes a new ID after nixie refused the action', () => {
  const hook = renderHook(() => useActionID());
  const first = hook.result.current.id;

  act(() => {
    hook.result.current.settle(new ORPCError('CLIENT_IN_USE'));
  });

  expect(hook.result.current.id).not.toBe(first);
});

test('it keeps the ID after a call that got no answer', () => {
  const hook = renderHook(() => useActionID());
  const first = hook.result.current.id;

  act(() => {
    hook.result.current.settle(new TypeError('fetch failed'));
  });

  expect(hook.result.current.id).toBe(first);
});
