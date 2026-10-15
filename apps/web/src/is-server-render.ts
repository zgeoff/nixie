import { createIsomorphicFn } from '@tanstack/react-start';

// True while the Start server renders a page, and false in the browser.
export const isServerRender = createIsomorphicFn()
  .server(() => true)
  .client(() => false);
