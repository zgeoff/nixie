import { afterEach } from 'bun:test';
import { addMockHandlers } from '@heynixie/mock-server';
import { githubHandlers } from './github-handlers';
import { githubStore } from './github-store';

addMockHandlers(...githubHandlers);

afterEach(() => {
  githubStore.reset();
});
