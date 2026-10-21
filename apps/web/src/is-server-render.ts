import { createIsomorphicFn } from '@tanstack/react-start';

export const isServerRender = createIsomorphicFn()
  .server(() => true)
  .client(() => false);
