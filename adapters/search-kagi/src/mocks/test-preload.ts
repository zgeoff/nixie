import { afterEach } from 'bun:test';
import { addMockHandlers } from '@heynixie/mock-server';
import { kagiHandlers } from './kagi-handlers';
import { kagiStore } from './kagi-store';

addMockHandlers(...kagiHandlers);

afterEach(() => {
  kagiStore.reset();
});
