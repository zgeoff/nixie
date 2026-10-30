import { expect, test } from 'bun:test';
import { renderHook } from './test-utils/render-hook';
import { useIsHydrated } from './use-is-hydrated';

test('it gives true once the hook renders in the browser', () => {
  const hook = renderHook(() => useIsHydrated());

  expect(hook.result.current).toBeTrue();
});
